// The readers' Private records, kept by this instance (ADR 0012, ADR 0016):
// `library.sqlite` in DATA_DIR, apart from the Catalog. One generic table that
// mirrors atproto (collection, record key, value), keyed by the Account that
// owns it (ADR 0016). Every call is limited to one Account.
// Never logs a record value.
import type { DatabaseSync } from 'node:sqlite';
import type { AccountId } from './accounts';

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
  put(account: AccountId, collection: string, rkey: string, value: object, base?: number): number;
  // Undefined when the record does not exist or was deleted.
  get(account: AccountId, collection: string, rkey: string): unknown;
  // Every record of the collection, newest key first, as a PDS lists them.
  list(account: AccountId, collection: string): StoredRecord[];
  // Leaves a tombstone, so other devices learn of the delete, and gives its rev.
  // Deleting a record that does not exist succeeds (with no `base`). With
  // `base`, as put.
  delete(account: AccountId, collection: string, rkey: string, base?: number): number | undefined;
  changesSince(account: AccountId, since: number): Changes;
  close(): void;
}

// A device that has not synced for this long lists everything again.
const tombstoneDays = 30;

// `db` has run `librarySteps` (migrations.ts). The store closes it.
export function createLibraryStore(db: DatabaseSync, now: () => Date = () => new Date()): LibraryStore {

  const purgedRev = (account: AccountId) => (db.prepare('select rev from purged where account = ?').get(account) as { rev: number } | undefined)?.rev ?? 0;
  // A purge never takes the rev back.
  const lastRev = (account: AccountId) =>
    Math.max(
      purgedRev(account),
      (db.prepare('select coalesce(max(rev), 0) as last from record where account = ?').get(account) as { last: number }).last,
    );

  // One process per instance (ADR 0007) and synchronous SQLite: nothing runs
  // between the base check, reading the last rev and writing the next one.
  function write(account: AccountId, collection: string, rkey: string, value: string | null, base: number | undefined): number {
    if (base !== undefined) {
      const row = db.prepare('select rev from record where account = ? and collection = ? and rkey = ?').get(account, collection, rkey) as
        | { rev: number }
        | undefined;
      if (row?.rev !== base) throw new StaleRecordError(base);
    }
    const rev = lastRev(account) + 1;
    db.prepare(
      `insert into record (account, collection, rkey, value, rev, updated_at, deleted) values (?, ?, ?, ?, ?, ?, ?)
       on conflict (account, collection, rkey) do update set
         value = excluded.value, rev = excluded.rev, updated_at = excluded.updated_at, deleted = excluded.deleted`,
    ).run(account, collection, rkey, value, rev, now().toISOString(), value === null ? 1 : 0);
    return rev;
  }

  // Drops the Account's old tombstones and remembers the newest one dropped.
  function purge(account: AccountId) {
    const before = new Date(now().getTime() - tombstoneDays * 24 * 60 * 60 * 1000).toISOString();
    const { newest } = db
      .prepare('select max(rev) as newest from record where account = ? and deleted = 1 and updated_at < ?')
      .get(account, before) as { newest: number | null };
    if (newest === null) return;
    db.prepare('delete from record where account = ? and deleted = 1 and updated_at < ?').run(account, before);
    db.prepare('insert into purged (account, rev) values (?, ?) on conflict (account) do update set rev = max(rev, excluded.rev)').run(account, newest);
  }

  return {
    put: (account, collection, rkey, value, base) => write(account, collection, rkey, JSON.stringify(value), base),
    get(account, collection, rkey) {
      const row = db
        .prepare('select value from record where account = ? and collection = ? and rkey = ? and deleted = 0')
        .get(account, collection, rkey) as { value: string } | undefined;
      return row && (JSON.parse(row.value) as unknown);
    },
    list(account, collection) {
      const rows = db
        .prepare('select rkey, value from record where account = ? and collection = ? and deleted = 0 order by rkey desc')
        .all(account, collection) as { rkey: string; value: string }[];
      return rows.map(({ rkey, value }) => ({ rkey, value: JSON.parse(value) as unknown }));
    },
    delete(account, collection, rkey, base) {
      const exists = db.prepare('select 1 from record where account = ? and collection = ? and rkey = ? and deleted = 0').get(account, collection, rkey);
      if (!exists && base === undefined) return undefined;
      const rev = write(account, collection, rkey, null, base);
      purge(account);
      return rev;
    },
    changesSince(account, since) {
      const all = since <= 0 || since < purgedRev(account);
      const rows = db
        .prepare(
          `select collection, rkey, value, rev, deleted from record
           where account = ? and rev > ? ${all ? 'and deleted = 0' : ''} order by rev`,
        )
        .all(account, all ? 0 : since) as { collection: string; rkey: string; value: string | null; rev: number; deleted: number }[];
      return {
        rev: lastRev(account),
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
