// The readers' Private records, kept by this instance until atproto Spaces is
// released (ADR 0012): `library.sqlite` in DATA_DIR, apart from the Catalog.
// One generic table that mirrors atproto (DID, collection, record key, value),
// so the move to Spaces is a copy. Every call is limited to one reader's DID.
// Never logs a record value.
import { DatabaseSync } from 'node:sqlite';

export interface StoredRecord {
  rkey: string;
  value: unknown;
}

// What changed for a reader since a `rev` a device has (ADR 0012).
export interface Changes {
  // The newest rev: the device asks with it next time.
  rev: number;
  // True when the answer is every record, not only the changes (a device with
  // nothing yet, or one whose rev is older than the purged tombstones): the
  // device drops what it has and keeps only these records.
  all: boolean;
  // Oldest change first.
  records: { collection: string; rkey: string; value: unknown; rev: number }[];
  deleted: { collection: string; rkey: string }[];
}

// The write was based on `base`, but the record changed since: another device wrote it.
export class StaleRecordError extends Error {
  constructor(base: number) {
    super(`The record changed since rev ${base}`);
    this.name = 'StaleRecordError';
  }
}

export interface LibraryStore {
  // Creates or replaces the record. Gives its new `rev`. With `base`, throws a
  // StaleRecordError when the record's rev is not `base` any more.
  put(did: string, collection: string, rkey: string, value: object, base?: number): number;
  // Undefined when the record does not exist or was deleted.
  get(did: string, collection: string, rkey: string): unknown;
  // Every record of the collection, newest key first, as a PDS lists them.
  list(did: string, collection: string): StoredRecord[];
  // Leaves a tombstone, so other devices learn of the delete, and gives its rev.
  // Deleting a record that does not exist succeeds (with no `base`). With
  // `base`, as put.
  delete(did: string, collection: string, rkey: string, base?: number): number | undefined;
  changesSince(did: string, since: number): Changes;
  close(): void;
}

// A device that has not synced for this long lists everything again.
const tombstoneDays = 30;

// `rev` grows with each write of a reader: a device asks for the records
// changed since the last `rev` it has (ADR 0012). `purged` keeps, per reader,
// the newest rev of a purged tombstone.
const schema = `
  create table if not exists record (
    did text not null,
    collection text not null,
    rkey text not null,
    value text,
    rev integer not null,
    updated_at text not null,
    deleted integer not null default 0,
    primary key (did, collection, rkey)
  );
  create index if not exists record_rev on record (did, rev);
  create table if not exists purged (
    did text primary key,
    rev integer not null
  );
`;

export function createLibraryStore(file: string, now: () => Date = () => new Date()): LibraryStore {
  const db = new DatabaseSync(file);
  db.exec(schema);

  const purgedRev = (did: string) => (db.prepare('select rev from purged where did = ?').get(did) as { rev: number } | undefined)?.rev ?? 0;
  // A purge never takes the rev back.
  const lastRev = (did: string) =>
    Math.max(
      purgedRev(did),
      (db.prepare('select coalesce(max(rev), 0) as last from record where did = ?').get(did) as { last: number }).last,
    );

  // One process per instance (ADR 0007) and synchronous SQLite: nothing runs
  // between the base check, reading the last rev and writing the next one.
  function write(did: string, collection: string, rkey: string, value: string | null, base: number | undefined): number {
    if (base !== undefined) {
      const row = db.prepare('select rev from record where did = ? and collection = ? and rkey = ?').get(did, collection, rkey) as
        | { rev: number }
        | undefined;
      if (row?.rev !== base) throw new StaleRecordError(base);
    }
    const rev = lastRev(did) + 1;
    db.prepare(
      `insert into record (did, collection, rkey, value, rev, updated_at, deleted) values (?, ?, ?, ?, ?, ?, ?)
       on conflict (did, collection, rkey) do update set
         value = excluded.value, rev = excluded.rev, updated_at = excluded.updated_at, deleted = excluded.deleted`,
    ).run(did, collection, rkey, value, rev, now().toISOString(), value === null ? 1 : 0);
    return rev;
  }

  // Drops the reader's old tombstones and remembers the newest one dropped.
  function purge(did: string) {
    const before = new Date(now().getTime() - tombstoneDays * 24 * 60 * 60 * 1000).toISOString();
    const { newest } = db
      .prepare('select max(rev) as newest from record where did = ? and deleted = 1 and updated_at < ?')
      .get(did, before) as { newest: number | null };
    if (newest === null) return;
    db.prepare('delete from record where did = ? and deleted = 1 and updated_at < ?').run(did, before);
    db.prepare('insert into purged (did, rev) values (?, ?) on conflict (did) do update set rev = max(rev, excluded.rev)').run(did, newest);
  }

  return {
    put: (did, collection, rkey, value, base) => write(did, collection, rkey, JSON.stringify(value), base),
    get(did, collection, rkey) {
      const row = db
        .prepare('select value from record where did = ? and collection = ? and rkey = ? and deleted = 0')
        .get(did, collection, rkey) as { value: string } | undefined;
      return row && (JSON.parse(row.value) as unknown);
    },
    list(did, collection) {
      const rows = db
        .prepare('select rkey, value from record where did = ? and collection = ? and deleted = 0 order by rkey desc')
        .all(did, collection) as { rkey: string; value: string }[];
      return rows.map(({ rkey, value }) => ({ rkey, value: JSON.parse(value) as unknown }));
    },
    delete(did, collection, rkey, base) {
      const exists = db.prepare('select 1 from record where did = ? and collection = ? and rkey = ? and deleted = 0').get(did, collection, rkey);
      if (!exists && base === undefined) return undefined;
      const rev = write(did, collection, rkey, null, base);
      purge(did);
      return rev;
    },
    changesSince(did, since) {
      const all = since <= 0 || since < purgedRev(did);
      const rows = db
        .prepare(
          `select collection, rkey, value, rev, deleted from record
           where did = ? and rev > ? ${all ? 'and deleted = 0' : ''} order by rev`,
        )
        .all(did, all ? 0 : since) as { collection: string; rkey: string; value: string | null; rev: number; deleted: number }[];
      return {
        rev: lastRev(did),
        all,
        records: rows.flatMap(({ collection, rkey, value, rev, deleted }) =>
          deleted ? [] : [{ collection, rkey, value: JSON.parse(value!) as unknown, rev }],
        ),
        deleted: rows.flatMap(({ collection, rkey, deleted }) => (deleted ? [{ collection, rkey }] : [])),
      };
    },
    close: () => db.close(),
  };
}
