// Sharing by category (glossary: Shared, CORE-38). Until Spaces (ADR 0012)
// every record stays on this instance, which the devices sync with; sharing a
// category also writes its records to the reader's public repo on their PDS,
// through their OAuth session (ADR 0013), and unsharing deletes them there.
//
// The public repo always follows what the instance holds: `sync` puts every
// record that should be public, as it should read, and deletes every other
// record of the Shared collections. So it is safe to run again after a
// partial failure, and `pending` says that it must. A change to one record
// (`recordChanged`) puts or deletes that record only. Atomes owns the
// `app.atomes.*` namespace (ADR 0004), so the sync deletes any record of the
// three Shared collections that the instance does not want, whoever wrote it.
// A pending reader is tried again at the next record change, the next look at
// Settings (`state`) and the next sign-in (`signedIn`).
//
// What the reader chose is kept in `library.sqlite`, beside the records:
// the Shared categories and the Works kept Private inside them. Each call is
// limited to one Account (ADR 0016); nothing here takes an Account from a
// request. The PDS is reached with the DID of the Account (`didOf`): an
// Account with no DID cannot share.
// Never logs a record value.
import type { DatabaseSync } from 'node:sqlite';
import { errorLogText, type AccountId, type Did } from './accounts';
import { inTransaction } from './migrate';
import { categories, categoryNames, type Category, type SharingState } from '../sharing/categories';
import type { LibraryStore } from './library-store';
import type { PublicRepo } from './public-repo';

export interface RepoAccess {
  // The reader's public repo, or undefined when their OAuth session may not
  // write Shared records (none, ended, or signed in with a narrower scope):
  // they sign in again. Throws when the PDS cannot be reached.
  repoOf(did: Did): Promise<PublicRepo | undefined>;
}

// Sharing needs the reader to sign in again first: nothing was saved.
export class NeedsConsentError extends Error {
  constructor() {
    super('The session may not write Shared records: sign in again');
    this.name = 'NeedsConsentError';
  }
}

export interface Sharing {
  // Tries the PDS again first when something is pending.
  state(account: AccountId): Promise<SharingState>;
  // Turning a category on throws NeedsConsentError, and saves nothing, when
  // the session may not write Shared records. Turning one off always saves.
  setShared(account: AccountId, category: Category, shared: boolean): Promise<SharingState>;
  setPrivate(account: AccountId, work: string, kept: boolean): Promise<SharingState>;
  // The same for many Works at once (bulk select), with one sync of the PDS.
  setPrivateWorks(account: AccountId, works: readonly string[], kept: boolean): Promise<SharingState>;
  // Brings the public repo in line with the instance.
  sync(account: AccountId): Promise<SharingState>;
  // The reader signed in again: their session may now write what waited.
  signedIn(account: AccountId): Promise<void>;
  // A record of the instance changed (Library API): mirror it if its category
  // is Shared. Never rejects: a failure leaves the reader pending.
  recordChanged(account: AccountId, collection: string, rkey: string): Promise<void>;
  // The Account is deleted (CORE-55): deletes every record of the Shared
  // collections from its PDS, then its choices here, whatever the PDS
  // answered. `sharedLeft`: the PDS may still hold Shared records.
  forget(account: AccountId): Promise<{ sharedLeft: boolean }>;
  close(): void;
}

const categoryOf = (collection: string) => categoryNames.find((category) => categories[category] === collection);

// The record as anyone may read it, or undefined when it stays Private. A
// Reading Status is keyed by its Work (ADR 0010): the key and the `work` field
// both count. A Label with Works, all of them Private, stays Private even on a
// Series: its name and its Series could tell the Work. A Label with no Work at
// all (on a Series only, or empty) is Shared, with its Private Works left out.
function publicValue(collection: string, rkey: string, value: unknown, privateWorks: ReadonlySet<string>): object | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  switch (collection) {
    case categories.readingStatuses:
      return privateWorks.has(rkey) || privateWorks.has(String(record.work)) ? undefined : record;
    case categories.labels: {
      const works = Array.isArray(record.works) ? record.works : [];
      const shared = works.filter((work) => !privateWorks.has(String(work)));
      return works.length > 0 && shared.length === 0 ? undefined : { ...record, works: shared };
    }
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

export function logFailure(step: string, error: unknown) {
  console.warn(`Sharing ${step} failed: ${errorLogText(error)}`);
}

// `db` is a connection to `library.sqlite` that has run `librarySteps`
// (migrations.ts). Sharing closes it. `didOf`: the DID identity of the
// Account (accounts.ts).
export function createSharing({
  db,
  library,
  access,
  didOf,
}: {
  db: DatabaseSync;
  library: LibraryStore;
  access: RepoAccess;
  didOf: (account: AccountId) => Did | undefined;
}): Sharing {
  // Undefined for an Account with no DID: it cannot share.
  const repoOf = async (account: AccountId) => {
    const did = didOf(account);
    return did && access.repoOf(did);
  };

  const sharedOf = (account: AccountId) => {
    const rows = db.prepare('select category from shared_category where account = ?').all(account) as { category: string }[];
    const on = new Set(rows.map((row) => row.category));
    return Object.fromEntries(categoryNames.map((category) => [category, on.has(category)])) as Record<Category, boolean>;
  };
  const privateWorksOf = (account: AccountId) =>
    new Set((db.prepare('select work from private_work where account = ? order by work').all(account) as { work: string }[]).map((row) => row.work));
  const isPending = (account: AccountId) => db.prepare('select 1 from sharing_pending where account = ?').get(account) !== undefined;
  function setPending(account: AccountId, pending: boolean) {
    if (pending) db.prepare('insert or ignore into sharing_pending (account) values (?)').run(account);
    else db.prepare('delete from sharing_pending where account = ?').run(account);
  }

  // One change at a time per reader, so two mirrors of a record never land out of order.
  const queues = new Map<string, Promise<unknown>>();
  function serial<T>(account: AccountId, task: () => Promise<T>): Promise<T> {
    const run = (queues.get(account) ?? Promise.resolve()).then(task, task);
    const settled = run.catch(() => undefined);
    queues.set(account, settled);
    void settled.then(() => {
      if (queues.get(account) === settled) queues.delete(account);
    });
    return run;
  }

  async function syncWith(account: AccountId, repo: PublicRepo) {
    const shared = sharedOf(account);
    const privateWorks = privateWorksOf(account);
    for (const category of categoryNames) {
      const collection = categories[category];
      const wanted = new Map<string, object>();
      if (shared[category]) {
        for (const { rkey, value } of library.list(account, collection)) {
          const record = publicValue(collection, rkey, value, privateWorks);
          if (record) wanted.set(rkey, record);
        }
      }
      const present = new Map((await repo.list(collection)).map(({ rkey, value }) => [rkey, canonical(value)]));
      for (const [rkey, record] of wanted) if (present.get(rkey) !== canonical(record)) await repo.put(collection, rkey, record);
      for (const rkey of present.keys()) if (!wanted.has(rkey)) await repo.delete(collection, rkey);
    }
  }

  // Runs the sync and remembers whether it must run again.
  async function trySync(account: AccountId, repo?: PublicRepo) {
    try {
      const target = repo ?? (await repoOf(account));
      if (!target) return setPending(account, true);
      await syncWith(account, target);
      setPending(account, false);
    } catch (error) {
      setPending(account, true);
      logFailure('sync', error);
    }
  }

  async function canShare(account: AccountId) {
    try {
      return (await repoOf(account)) !== undefined;
    } catch {
      // The PDS is out of reach: that says nothing about the permission.
      return true;
    }
  }

  async function state(account: AccountId): Promise<SharingState> {
    return {
      shared: sharedOf(account),
      privateWorks: [...privateWorksOf(account)],
      pending: isPending(account),
      canShare: await canShare(account),
      atproto: didOf(account) !== undefined,
    };
  }

  function setPrivateWorks(account: AccountId, works: readonly string[], kept: boolean) {
    return serial(account, async () => {
      const change = kept
        ? db.prepare('insert or ignore into private_work (account, work) values (?, ?)')
        : db.prepare('delete from private_work where account = ? and work = ?');
      inTransaction(db, () => {
        for (const work of works) change.run(account, work);
      });
      await trySync(account);
      return state(account);
    });
  }

  return {
    state: (account) =>
      serial(account, async () => {
        if (isPending(account)) await trySync(account);
        return state(account);
      }),
    setShared: (account, category, shared) =>
      serial(account, async () => {
        const repo = await repoOf(account).catch((error: unknown) => {
          // Turning a category off still saves and deletes later.
          if (shared) throw error;
          return undefined;
        });
        if (shared && !repo) throw new NeedsConsentError();
        if (shared) db.prepare('insert or ignore into shared_category (account, category) values (?, ?)').run(account, category);
        else db.prepare('delete from shared_category where account = ? and category = ?').run(account, category);
        await trySync(account, repo);
        return state(account);
      }),
    setPrivate: (account, work, kept) => setPrivateWorks(account, [work], kept),
    setPrivateWorks,
    sync: (account) =>
      serial(account, async () => {
        await trySync(account);
        return state(account);
      }),
    signedIn: (account) =>
      serial(account, async () => {
        if (isPending(account)) await trySync(account);
      }),
    recordChanged: (account, collection, rkey) =>
      serial(account, async () => {
        try {
          const category = categoryOf(collection);
          if (!category) return;
          if (isPending(account)) return await trySync(account);
          if (!sharedOf(account)[category]) return;
          const repo = await repoOf(account);
          if (!repo) return setPending(account, true);
          const record = publicValue(collection, rkey, library.get(account, collection, rkey), privateWorksOf(account));
          if (record) await repo.put(collection, rkey, record);
          else await repo.delete(collection, rkey);
        } catch (error) {
          logFailure('mirror', error);
          try {
            setPending(account, true);
          } catch (stored) {
            logFailure('mirror', stored);
          }
        }
      }),
    forget: (account) =>
      serial(account, async () => {
        let sharedLeft = false;
        // Nothing was ever sent while no category is Shared and nothing waits.
        if (isPending(account) || Object.values(sharedOf(account)).some(Boolean)) {
          try {
            const repo = await repoOf(account);
            if (!repo) sharedLeft = true;
            else for (const collection of Object.values(categories)) for (const { rkey } of await repo.list(collection)) await repo.delete(collection, rkey);
          } catch (error) {
            logFailure('delete', error);
            sharedLeft = true;
          }
        }
        inTransaction(db, () => {
          for (const table of ['shared_category', 'private_work', 'sharing_pending']) db.prepare(`delete from ${table} where account = ?`).run(account);
        });
        return { sharedLeft };
      }),
    close: () => db.close(),
  };
}
