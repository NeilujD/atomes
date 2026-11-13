// Sharing by category (glossary: Shared, CORE-38). Until Spaces (ADR 0012)
// every record stays on this instance, which the devices sync with; sharing a
// category also writes its records to the reader's public repo on their PDS,
// through their OAuth session (ADR 0013), and unsharing deletes them there.
//
// The public repo always follows what the instance holds: `sync` puts every
// record that should be public, as it should read, and deletes every other
// record of the Shared collections. So it is safe to run again after a
// partial failure, and `pending` says that it must. A change to one record
// (`recordChanged`) puts or deletes that record only.
//
// What the reader chose is kept in `library.sqlite`, beside the records:
// the Shared categories and the Works kept Private inside them. Each call is
// limited to one reader's DID; nothing here takes a DID from a request.
// Never logs a record value.
import { DatabaseSync } from 'node:sqlite';
import { categories, categoryNames, type Category, type SharingState } from '../sharing/categories';
import type { LibraryStore } from './library-store';
import type { PublicRepo } from './public-repo';

export interface RepoAccess {
  // The reader's public repo, or undefined when their OAuth session may not
  // write Shared records (none, ended, or signed in with a narrower scope):
  // they sign in again. Throws when the PDS cannot be reached.
  repoOf(did: string): Promise<PublicRepo | undefined>;
}

// Sharing needs the reader to sign in again first: nothing was saved.
export class NeedsConsentError extends Error {
  constructor() {
    super('The session may not write Shared records: sign in again');
    this.name = 'NeedsConsentError';
  }
}

export interface Sharing {
  state(did: string): Promise<SharingState>;
  // Turning a category on throws NeedsConsentError, and saves nothing, when
  // the session may not write Shared records. Turning one off always saves.
  setShared(did: string, category: Category, shared: boolean): Promise<SharingState>;
  setPrivate(did: string, work: string, kept: boolean): Promise<SharingState>;
  // Brings the public repo in line with the instance.
  sync(did: string): Promise<SharingState>;
  // A record of the instance changed (Library API): mirror it if its category is Shared.
  recordChanged(did: string, collection: string, rkey: string): Promise<void>;
  close(): void;
}

const schema = `
  create table if not exists shared_category (
    did text not null,
    category text not null,
    primary key (did, category)
  );
  create table if not exists private_work (
    did text not null,
    work text not null,
    primary key (did, work)
  );
  create table if not exists sharing_pending (
    did text primary key
  );
`;

const categoryOf = (collection: string) => categoryNames.find((category) => categories[category] === collection);

// The record as anyone may read it, or undefined when it stays Private.
function publicValue(collection: string, value: unknown, privateWorks: ReadonlySet<string>): object | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  switch (collection) {
    case categories.readingStatuses:
      return privateWorks.has(String(record.work)) ? undefined : record;
    case categories.labels:
      return { ...record, works: (Array.isArray(record.works) ? record.works : []).filter((work) => !privateWorks.has(String(work))) };
    case categories.follows:
      return record;
    default:
      return undefined;
  }
}

// The PDS may give the keys back in another order (DAG-CBOR).
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, each]) => `${JSON.stringify(key)}:${canonical(each)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function logFailure(step: string, error: unknown) {
  const name = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
  console.warn(`Sharing ${step} failed: ${name}`);
}

export function createSharing({ file, library, access }: { file: string; library: LibraryStore; access: RepoAccess }): Sharing {
  const db = new DatabaseSync(file);
  db.exec(schema);

  const sharedOf = (did: string) => {
    const rows = db.prepare('select category from shared_category where did = ?').all(did) as { category: string }[];
    const on = new Set(rows.map((row) => row.category));
    return Object.fromEntries(categoryNames.map((category) => [category, on.has(category)])) as Record<Category, boolean>;
  };
  const privateWorksOf = (did: string) =>
    new Set((db.prepare('select work from private_work where did = ? order by work').all(did) as { work: string }[]).map((row) => row.work));
  const isPending = (did: string) => db.prepare('select 1 from sharing_pending where did = ?').get(did) !== undefined;
  function setPending(did: string, pending: boolean) {
    if (pending) db.prepare('insert or ignore into sharing_pending (did) values (?)').run(did);
    else db.prepare('delete from sharing_pending where did = ?').run(did);
  }

  // One change at a time per reader, so two mirrors of a record never land out of order.
  const queues = new Map<string, Promise<unknown>>();
  function serial<T>(did: string, task: () => Promise<T>): Promise<T> {
    const run = (queues.get(did) ?? Promise.resolve()).then(task, task);
    const settled = run.catch(() => undefined);
    queues.set(did, settled);
    void settled.then(() => {
      if (queues.get(did) === settled) queues.delete(did);
    });
    return run;
  }

  async function syncWith(did: string, repo: PublicRepo) {
    const shared = sharedOf(did);
    const privateWorks = privateWorksOf(did);
    for (const category of categoryNames) {
      const collection = categories[category];
      const wanted = new Map<string, object>();
      if (shared[category]) {
        for (const { rkey, value } of library.list(did, collection)) {
          const record = publicValue(collection, value, privateWorks);
          if (record) wanted.set(rkey, record);
        }
      }
      const present = new Map((await repo.list(collection)).map(({ rkey, value }) => [rkey, canonical(value)]));
      for (const [rkey, record] of wanted) if (present.get(rkey) !== canonical(record)) await repo.put(collection, rkey, record);
      for (const rkey of present.keys()) if (!wanted.has(rkey)) await repo.delete(collection, rkey);
    }
  }

  // Runs the sync and remembers whether it must run again.
  async function trySync(did: string, repo?: PublicRepo) {
    try {
      const target = repo ?? (await access.repoOf(did));
      if (!target) return setPending(did, true);
      await syncWith(did, target);
      setPending(did, false);
    } catch (error) {
      setPending(did, true);
      logFailure('sync', error);
    }
  }

  async function canShare(did: string) {
    try {
      return (await access.repoOf(did)) !== undefined;
    } catch {
      // The PDS is out of reach: that says nothing about the permission.
      return true;
    }
  }

  async function state(did: string): Promise<SharingState> {
    return { shared: sharedOf(did), privateWorks: [...privateWorksOf(did)], pending: isPending(did), canShare: await canShare(did) };
  }

  return {
    state: (did) => serial(did, () => state(did)),
    setShared: (did, category, shared) =>
      serial(did, async () => {
        const repo = await access.repoOf(did).catch((error: unknown) => {
          // Turning a category off still saves and deletes later.
          if (shared) throw error;
          return undefined;
        });
        if (shared && !repo) throw new NeedsConsentError();
        if (shared) db.prepare('insert or ignore into shared_category (did, category) values (?, ?)').run(did, category);
        else db.prepare('delete from shared_category where did = ? and category = ?').run(did, category);
        await trySync(did, repo);
        return state(did);
      }),
    setPrivate: (did, work, kept) =>
      serial(did, async () => {
        if (kept) db.prepare('insert or ignore into private_work (did, work) values (?, ?)').run(did, work);
        else db.prepare('delete from private_work where did = ? and work = ?').run(did, work);
        await trySync(did);
        return state(did);
      }),
    sync: (did) =>
      serial(did, async () => {
        await trySync(did);
        return state(did);
      }),
    recordChanged: (did, collection, rkey) =>
      serial(did, async () => {
        const category = categoryOf(collection);
        if (!category) return;
        if (isPending(did)) return trySync(did);
        if (!sharedOf(did)[category]) return;
        try {
          const repo = await access.repoOf(did);
          if (!repo) return setPending(did, true);
          const record = publicValue(collection, library.get(did, collection, rkey), privateWorksOf(did));
          if (record) await repo.put(collection, rkey, record);
          else await repo.delete(collection, rkey);
        } catch (error) {
          setPending(did, true);
          logFailure('mirror', error);
        }
      }),
    close: () => db.close(),
  };
}
