// The one repair of reader records after the Catalog drops the Works a source
// gave to several Volume numbers (ADR 0010, amendment 2026-11-14; Catalog
// side in src/lib/catalog/shared-works.ts). The only exception to "reader
// records are never rewritten". The server runs it at its first health check
// after each start (start-up.ts, ADR 0010, amendment 2026-11-21);
// `scripts/repair-shared-works.ts --dry-run` shows what it would change.
//
// For each reader, a record whose Work the Catalog dropped, and no longer
// gives to the record's Edition:
// - a Reading Status moves to the Work the Catalog gives the Edition read now
//   (`isbn:<isbn>` when it holds none): its record key is its Work, so the new
//   record is put and the old one deleted. When a newer Reading Status is
//   already there, it stays and the old one goes;
// - a Copy's dropped Work becomes the Work of the Copy's Edition, the same way;
// - a Label is listed, not changed: a dropped Work stands for many Editions;
// - a Work kept Private (sharing.ts) is listed too; the Work of each Reading
//   Status moved from it is kept Private, so a Private status stays Private.
//
// Writes go through the Library store, so devices learn them at their next
// sync. A reader with a Shared category is marked pending: the public repo
// follows at their next record change, Settings visit or sign-in (sharing.ts).
// Runs again with no change. Node runs it in the Docker image with type
// stripping alone: no import outside `node:` and `./library-store.ts` (type imports are erased).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AccountId } from './accounts.ts';
import { createLibraryStore, type StoredRecord } from './library-store.ts';

// The collections of src/lib/library, whose modules Node cannot load here.
export const collections = { readingStatus: 'app.atomes.readingStatus', copy: 'app.atomes.copy', label: 'app.atomes.label' } as const;

export interface ReaderRecords {
  account: AccountId;
  readingStatuses: StoredRecord[];
  copies: StoredRecord[];
  labels: StoredRecord[];
  // The Works the reader keeps Private.
  privateWorks: string[];
}

export interface Repair {
  account: AccountId;
  puts: { collection: string; rkey: string; value: object }[];
  deletes: { collection: string; rkey: string }[];
  // Listed, not changed.
  labels: { rkey: string; name: string; works: string[] }[];
  // `listed`: dropped Works kept Private. `added`: Works to keep Private.
  privateWorks: { listed: string[]; added: string[] };
  // Records per type that the repair moves, changes or lists.
  counts: { readingStatuses: number; copies: number; labels: number; privateWorks: number };
}

type Fields = Record<string, unknown>;
const fields = (value: unknown): Fields => (typeof value === 'object' && value !== null ? (value as Fields) : {});
const text = (value: unknown) => (typeof value === 'string' ? value : '');
const editionWork = (isbn: string) => `isbn:${isbn}`;

// `dropped`: the Works the Catalog dropped. `workOf`: the Work the Catalog
// gives an ISBN now, undefined when it holds no Edition for it.
export function planRepair(reader: ReaderRecords, dropped: ReadonlySet<string>, workOf: (isbn: string) => string | undefined): Repair {
  const stale = (work: string, isbn: unknown) => typeof isbn === 'string' && dropped.has(work) && workOf(isbn) !== work;
  // The Work the Catalog gives the Edition now; its own `isbn:` Work when it holds none.
  const workNow = (isbn: unknown) => workOf(text(isbn)) ?? editionWork(text(isbn));
  const puts: Repair['puts'] = [];
  const deletes: Repair['deletes'] = [];
  const added = new Set<string>();

  const statuses = new Map(reader.readingStatuses.map(({ rkey, value }) => [rkey, fields(value)]));
  let movedStatuses = 0;
  for (const { rkey, value } of reader.readingStatuses) {
    const status = fields(value);
    if (!stale(rkey, status.isbn)) continue;
    const target = workNow(status.isbn);
    const there = statuses.get(target);
    if (!there || text(there.updatedAt) < text(status.updatedAt)) {
      const moved = { ...status, work: target };
      statuses.set(target, moved);
      const planned = puts.findIndex((put) => put.rkey === target);
      if (planned !== -1) puts.splice(planned, 1);
      puts.push({ collection: collections.readingStatus, rkey: target, value: moved });
    }
    deletes.push({ collection: collections.readingStatus, rkey });
    if (reader.privateWorks.includes(rkey) && !reader.privateWorks.includes(target)) added.add(target);
    movedStatuses++;
  }

  let changedCopies = 0;
  for (const { rkey, value } of reader.copies) {
    const copy = fields(value);
    const works = Array.isArray(copy.works) ? copy.works.map(String) : [];
    if (!works.some((work) => stale(work, copy.isbn))) continue;
    const repaired = [...new Set(works.map((work) => (stale(work, copy.isbn) ? workNow(copy.isbn) : work)))];
    puts.push({ collection: collections.copy, rkey, value: { ...copy, works: repaired } });
    changedCopies++;
  }

  const labels = reader.labels.flatMap(({ rkey, value }) => {
    const label = fields(value);
    const works = (Array.isArray(label.works) ? label.works.map(String) : []).filter((work) => dropped.has(work));
    return works.length > 0 ? [{ rkey, name: text(label.name), works }] : [];
  });
  const listed = reader.privateWorks.filter((work) => dropped.has(work));

  return {
    account: reader.account,
    puts,
    deletes,
    labels,
    privateWorks: { listed, added: [...added] },
    counts: { readingStatuses: movedStatuses, copies: changedCopies, labels: labels.length, privateWorks: listed.length },
  };
}

const hasTable = (db: DatabaseSync, name: string) =>
  db.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(name) !== undefined;

// Repairs the readers of `library.sqlite` in `dataDir` from the Works
// `catalog.sqlite` dropped. Gives the repair of each reader it touches.
export function repairSharedWorks(dataDir: string, options: { dryRun: boolean }): Repair[] {
  const catalogFile = join(dataDir, 'catalog.sqlite');
  const libraryFile = join(dataDir, 'library.sqlite');
  if (!existsSync(catalogFile)) throw new Error(`No ${catalogFile}: is DATA_DIR right?`);
  const catalog = new DatabaseSync(catalogFile, { readOnly: true });
  let dropped: Set<string>;
  let workOf: (isbn: string) => string | undefined;
  try {
    if (!hasTable(catalog, 'dropped_work')) throw new Error(`${catalogFile} has not run the one-Work-per-Volume step: start the new server and wait for its first health check (GET /health), which runs the steps, then run this again.`);
    dropped = new Set((catalog.prepare('select work_id from dropped_work').all() as { work_id: string }[]).map((row) => row.work_id));
    const works = new Map(
      (catalog.prepare('select isbn, work_id from edition').all() as { isbn: string; work_id: string }[]).map((row) => [row.isbn, row.work_id]),
    );
    workOf = (isbn) => works.get(isbn);
  } finally {
    catalog.close();
  }
  if (dropped.size === 0 || !existsSync(libraryFile)) return [];

  const db = new DatabaseSync(libraryFile);
  const store = createLibraryStore(new DatabaseSync(libraryFile));
  try {
    // Wait for a write of the running server rather than fail.
    db.exec('pragma busy_timeout = 5000');
    const sharing = hasTable(db, 'shared_category');
    const owners = (
      db
        .prepare(`select distinct account from record where deleted = 0 and collection in (?, ?, ?) order by account`)
        .all(collections.readingStatus, collections.copy, collections.label) as { account: AccountId }[]
    ).map((row) => row.account);
    const privateWorksOf = (account: AccountId) =>
      hasTable(db, 'private_work')
        ? (db.prepare('select work from private_work where account = ? order by work').all(account) as { work: string }[]).map((row) => row.work)
        : [];

    const repairs = owners
      .map((account) =>
        planRepair(
          {
            account,
            readingStatuses: store.list(account, collections.readingStatus),
            copies: store.list(account, collections.copy),
            labels: store.list(account, collections.label),
            privateWorks: privateWorksOf(account),
          },
          dropped,
          workOf,
        ),
      )
      .filter(({ counts }) => Object.values(counts).some((count) => count > 0));
    if (options.dryRun) return repairs;

    for (const repair of repairs) {
      // The new records first: a repair stopped half-way loses nothing and runs again.
      for (const { collection, rkey, value } of repair.puts) store.put(repair.account, collection, rkey, value);
      for (const work of repair.privateWorks.added) db.prepare('insert or ignore into private_work (account, work) values (?, ?)').run(repair.account, work);
      for (const { collection, rkey } of repair.deletes) store.delete(repair.account, collection, rkey);
      const shares = sharing && db.prepare('select 1 from shared_category where account = ?').get(repair.account) !== undefined;
      if (shares && (repair.puts.length > 0 || repair.deletes.length > 0))
        db.prepare('insert or ignore into sharing_pending (account) values (?)').run(repair.account);
    }
    return repairs;
  } finally {
    store.close();
    db.close();
  }
}
