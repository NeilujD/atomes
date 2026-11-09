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

export interface LibraryStore {
  // Creates or replaces the record. Gives its new `rev`.
  put(did: string, collection: string, rkey: string, value: object): number;
  // Undefined when the record does not exist or was deleted.
  get(did: string, collection: string, rkey: string): unknown;
  // Every record of the collection, newest key first, as a PDS lists them.
  list(did: string, collection: string): StoredRecord[];
  // Leaves a tombstone, so other devices can learn of the delete (sync comes
  // later). Deleting a record that does not exist succeeds.
  delete(did: string, collection: string, rkey: string): void;
  close(): void;
}

// `rev` grows with each write of a reader: a device can later ask for the
// records changed since the last `rev` it has (ADR 0012).
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
`;

export function createLibraryStore(file: string, now: () => Date = () => new Date()): LibraryStore {
  const db = new DatabaseSync(file);
  db.exec(schema);

  // One process per instance (ADR 0007) and synchronous SQLite: nothing runs
  // between reading the last rev and writing the next one.
  function write(did: string, collection: string, rkey: string, value: string | null): number {
    const { last } = db.prepare('select coalesce(max(rev), 0) as last from record where did = ?').get(did) as { last: number };
    const rev = last + 1;
    db.prepare(
      `insert into record (did, collection, rkey, value, rev, updated_at, deleted) values (?, ?, ?, ?, ?, ?, ?)
       on conflict (did, collection, rkey) do update set
         value = excluded.value, rev = excluded.rev, updated_at = excluded.updated_at, deleted = excluded.deleted`,
    ).run(did, collection, rkey, value, rev, now().toISOString(), value === null ? 1 : 0);
    return rev;
  }

  return {
    put: (did, collection, rkey, value) => write(did, collection, rkey, JSON.stringify(value)),
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
    delete(did, collection, rkey) {
      const exists = db.prepare('select 1 from record where did = ? and collection = ? and rkey = ? and deleted = 0').get(did, collection, rkey);
      if (exists) write(did, collection, rkey, null);
    },
    close: () => db.close(),
  };
}
