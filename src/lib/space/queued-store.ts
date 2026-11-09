// What every store of Library records does on the device, whatever keeps the
// records (the instance today, ADR 0012; a Space later, ADR 0003): a local copy
// of the records last read, for offline reads, and an ordered queue of the
// writes not sent yet, for offline writes (ADR 0002). The `Remote` is the only
// part that knows where the records go.
import { isNetworkFailure } from '../network';
import type { LocalCopy } from './local-copy';

export interface SpaceRecord {
  rkey: string;
  value: unknown;
  // The store's rev of the record, in the local copy of a store that has revs
  // (the instance, ADR 0012). Never in a listing.
  rev?: number;
}

// What changed in the store since a rev (src/lib/server/library-store.ts).
export interface Changes {
  rev: number;
  // Every record, not only the changes: the device drops what it has.
  all: boolean;
  records: { collection: string; rkey: string; value: unknown; rev: number }[];
  deleted: { collection: string; rkey: string }[];
}

// The last sync of a store that has revs: its rev and the collections this
// device keeps a copy of. Once synced, a collection with no copy is empty.
export interface SyncState {
  rev: number;
  collections: string[];
}

// A write the store refused because the record changed on another device
// since this device read it. `value` is the record the write was based on for
// a delete, the record it would have written for a put: what the toast names.
export interface StaleWrite {
  collection: string;
  rkey: string;
  value: unknown;
}

export interface Listing {
  // With no rev.
  records: SpaceRecord[];
  // True when the store could not be reached: the records are the local copy,
  // as last read on this device with the waiting writes in it, and may be out of date.
  stale: boolean;
}

// A put or a delete kept on this device until the store has it.
export interface PendingWrite {
  collection: string;
  rkey: string;
  // The record to put; none for a delete.
  record?: Record<string, unknown>;
  // Set when the store refused the write: its reason. A refused write is not sent again.
  refused?: string;
  // The store's rev of the record this write was based on, when the device had one.
  base?: number;
}

// sent: the store has it. waiting: kept on this device, sent when the store can
// be reached and works again. refused: the store refused it; it stays in
// `pending()` with the reason, except a stale write, which is dropped.
export type WriteState = 'sent' | 'waiting' | 'refused';

export interface Space {
  // Prepares the store before the first write, when it needs it.
  ensure(): Promise<void>;
  // Writes a record. With no network, or while the store fails (`isTemporaryFailure`),
  // the write waits on this device, in order, and the local copy shows it at once.
  // Last write wins: a newer write to the same record replaces a waiting one.
  // Refused also when the record changed on another device since this device
  // read it (ADR 0012): the store's record wins, and `onStale` is told.
  put(collection: string, rkey: string, value: Record<string, unknown>): Promise<WriteState>;
  // Deletes a record, as put does: waits on this device with no network. Deleting a
  // record that does not exist succeeds.
  delete(collection: string, rkey: string): Promise<WriteState>;
  // Undefined when the record does not exist. Reads the store only, so it does
  // not see the waiting writes.
  get(collection: string, rkey: string): Promise<unknown>;
  // Every record of the collection, waiting writes included. Sends the waiting writes first.
  // A store with revs gives only what changed since the last list, for every
  // collection at once, and the rest comes from the local copy.
  // With no network, or while the store fails: the local copy, marked stale, if
  // this device has one.
  list(collection: string): Promise<Listing>;
  // Sends the waiting writes, oldest first. Stops at the first network failure.
  sendWaiting(): Promise<void>;
  // The writes not sent: waiting ones and refused ones, oldest first.
  pending(): Promise<PendingWrite[]>;
}

// Where the records go. Throws a `RefusedError` when the store refuses a call,
// and an error that `isTemporaryFailure` accepts when it cannot answer now.
export interface Remote {
  ensure(): Promise<void>;
  // A store with revs refuses the write with a `StaleError` when the record's
  // rev is not `base` any more, and gives the new rev.
  put(collection: string, rkey: string, record: Record<string, unknown>, base?: number): Promise<number | void>;
  delete(collection: string, rkey: string, base?: number): Promise<number | void>;
  get(collection: string, rkey: string): Promise<unknown>;
  list(collection: string): Promise<SpaceRecord[]>;
  // Only a store with revs (the instance, ADR 0012): every collection's
  // changes since `since`. The device then lists from its copy.
  changes?: (since: number) => Promise<Changes>;
}

// The store refused the call (HTTP 4xx): sending it again gives the same answer.
export class RefusedError extends Error {
  constructor(
    readonly error: string,
    message: string,
  ) {
    super(message);
    this.name = 'RefusedError';
  }
}

// The record changed on another device since this write was made (HTTP 409):
// the store's record wins.
export class StaleError extends RefusedError {
  constructor(message: string) {
    super('StaleRecord', message);
    this.name = 'StaleError';
  }
}

// The store was reached but could not do the work now (HTTP 5xx or 429), or
// the reader must sign in again first. Like no network, it passes: try again later.
export class UnavailableError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'UnavailableError';
  }
}

// The browser session ended: the writes wait until the reader signs in again.
export class SignedOutError extends UnavailableError {
  constructor(message: string) {
    super(401, message);
    this.name = 'SignedOutError';
  }
}

// A failure that passes on its own: no network, or the store failing for a while.
export function isTemporaryFailure(error: unknown): boolean {
  return isNetworkFailure(error) || error instanceof UnavailableError;
}

// `owner` names the reader and the store in the local copy: another account
// on the device never sees these records. The local copy keeps the store's
// records as last read (with their revs); the waiting writes are laid over
// them when listed. `onStale` is told of each stale write the store refused.
export function openQueuedStore(
  remote: Remote,
  owner: string,
  localCopy: LocalCopy,
  onStale: (write: StaleWrite) => void = () => undefined,
): Space {
  const copyKey = (collection: string) => `${owner}/${collection}`;
  const queueKey = `${owner}#pending`;
  const syncKey = `${owner}#sync`;
  const recordKey = ({ collection, rkey }: { collection: string; rkey: string }) => `${collection}/${rkey}`;
  // The records whose last write was stale, until write() reports it.
  const staleKeys = new Set<string>();
  // The collections listed since this store opened: a full sync rewrites their copy.
  const listed = new Set<string>();
  let syncing: Promise<void> | undefined;

  // Queue changes and sends run one at a time, so the writes go out in order.
  let turn: Promise<unknown> = Promise.resolve();
  function inTurn<T>(task: () => Promise<T>): Promise<T> {
    const result = turn.then(task);
    turn = result.catch(() => undefined);
    return result;
  }

  // The store's records of the collection as last read, or undefined when this
  // device has none. Once a store with revs is synced, every collection has a copy.
  async function storeCopy(collection: string): Promise<SpaceRecord[] | undefined> {
    const copy = await localCopy.read(copyKey(collection));
    if (copy || !remote.changes) return copy;
    return (await localCopy.readSync(syncKey)) ? [] : undefined;
  }

  // The copy with the waiting writes of the collection laid over it, as a listing shows it.
  async function withWaiting(collection: string, copy: SpaceRecord[]): Promise<SpaceRecord[]> {
    const waiting = (await localCopy.readQueue(queueKey)).filter(
      (pending) => pending.collection === collection && pending.refused === undefined,
    );
    return withWrites(copy, waiting).map(({ rkey, value }) => ({ rkey, value }));
  }

  async function write(change: PendingWrite): Promise<WriteState> {
    await inTurn(async () => {
      const queue = await localCopy.readQueue(queueKey);
      const same = (kept: PendingWrite) => recordKey(kept) === recordKey(change);
      // Based on the record as the write it replaces saw it, else as last read.
      const replaced = queue.find(same);
      const base = replaced ? replaced.base : (await localCopy.read(copyKey(change.collection)))?.find(({ rkey }) => rkey === change.rkey)?.rev;
      staleKeys.delete(recordKey(change));
      await localCopy.writeQueue(queueKey, [...queue.filter((kept) => !same(kept)), base === undefined ? change : { ...change, base }]);
    });
    await sendWaiting();
    if (staleKeys.delete(recordKey(change))) return 'refused';
    const kept = (await localCopy.readQueue(queueKey)).find((pending) => recordKey(pending) === recordKey(change));
    if (!kept) return 'sent';
    return kept.refused === undefined ? 'waiting' : 'refused';
  }

  // The store has the write: so has the copy, with the record's new rev.
  async function keepInCopy({ collection, rkey, record }: PendingWrite, rev: number | void) {
    // Only into a full copy: a copy with only this record would look like the
    // whole collection when offline.
    const copy = await storeCopy(collection);
    if (!copy) return;
    const others = copy.filter((kept) => kept.rkey !== rkey);
    const written = record ? [{ rkey, value: record, ...(typeof rev === 'number' ? { rev } : {}) }] : [];
    await localCopy.write(copyKey(collection), sortByKey([...others, ...written]));
  }

  function sendWaiting() {
    return inTurn(async () => {
      for (;;) {
        const next = (await localCopy.readQueue(queueKey)).find((pending) => pending.refused === undefined);
        if (!next) return;
        let refused: string | undefined;
        let stale = false;
        let rev: number | void = undefined;
        try {
          rev = next.record
            ? await remote.put(next.collection, next.rkey, next.record, next.base)
            : await remote.delete(next.collection, next.rkey, next.base);
        } catch (error) {
          // Kept as is: sent when the store can be reached and works again.
          if (isTemporaryFailure(error)) return;
          if (!(error instanceof RefusedError)) throw error;
          // Another device changed the record: its version wins, so this write is dropped.
          if (error instanceof StaleError) stale = true;
          else refused = error.message;
        }
        // Read again: a sign-out in another tab may have cleared the queue during the send.
        const queue = await localCopy.readQueue(queueKey);
        const sent = (pending: PendingWrite) => JSON.stringify(pending) === JSON.stringify(next);
        await localCopy.writeQueue(
          queueKey,
          refused === undefined
            ? queue.filter((pending) => !sent(pending))
            : queue.map((pending) => (sent(pending) ? { ...pending, refused } : pending)),
        );
        if (stale) {
          staleKeys.add(recordKey(next));
          const seen = (await localCopy.read(copyKey(next.collection)))?.find(({ rkey }) => rkey === next.rkey);
          onStale({ collection: next.collection, rkey: next.rkey, value: next.record ?? seen?.value });
        } else if (refused === undefined) {
          await keepInCopy(next, rev);
        }
      }
    });
  }

  // Brings the copy in step with the store: only what changed since the last
  // sync, or every record when the store says so (ADR 0012).
  function sync(changesSince: NonNullable<Remote['changes']>): Promise<void> {
    syncing ??= inTurn(async () => {
      const state = await localCopy.readSync(syncKey);
      const changes = await changesSince(state?.rev ?? 0);
      const changed = new Set([...changes.records, ...changes.deleted].map(({ collection }) => collection));
      const collections = [...new Set([...(state?.collections ?? []), ...listed, ...changed])];
      for (const collection of collections) {
        if (!changes.all && !changed.has(collection)) continue;
        const ofCollection = <T extends { collection: string }>(each: T) => each.collection === collection;
        const fresh = changes.records.filter(ofCollection).map(({ rkey, value, rev }) => ({ rkey, value, rev }));
        const replaced = new Set([...fresh, ...changes.deleted.filter(ofCollection)].map(({ rkey }) => rkey));
        const kept = changes.all ? [] : ((await localCopy.read(copyKey(collection))) ?? []).filter(({ rkey }) => !replaced.has(rkey));
        await localCopy.write(copyKey(collection), sortByKey([...kept, ...fresh]));
      }
      await localCopy.writeSync(syncKey, { rev: changes.rev, collections });
    }).finally(() => {
      syncing = undefined;
    });
    return syncing;
  }

  async function list(collection: string): Promise<Listing> {
    const { changes } = remote;
    if (changes) listed.add(collection);
    await sendWaiting();
    let fromStore: SpaceRecord[] | undefined;
    try {
      if (changes) await sync(changes);
      else fromStore = await remote.list(collection);
    } catch (error) {
      const copy = isTemporaryFailure(error) ? await storeCopy(collection) : undefined;
      if (!copy) throw error;
      return { records: await withWaiting(collection, copy), stale: true };
    }
    // In turn, so a write made during the list is not lost from the copy.
    return inTurn(async () => {
      if (fromStore) await localCopy.write(copyKey(collection), fromStore);
      return { records: await withWaiting(collection, fromStore ?? (await storeCopy(collection)) ?? []), stale: false };
    });
  }

  return {
    ensure: () => remote.ensure(),
    put: (collection, rkey, value) => write({ collection, rkey, record: { $type: collection, ...value } }),
    delete: (collection, rkey) => write({ collection, rkey }),
    get: (collection, rkey) => remote.get(collection, rkey),
    list,
    sendWaiting,
    pending: () => localCopy.readQueue(queueKey),
  };
}

// The records of one collection with these writes of the same collection applied
// in order. Newest key first, as a PDS lists them.
function withWrites(records: SpaceRecord[], writes: PendingWrite[]): SpaceRecord[] {
  let result = [...records];
  for (const { rkey, record } of writes) {
    result = result.filter((kept) => kept.rkey !== rkey);
    if (record) result.push({ rkey, value: record });
  }
  return sortByKey(result);
}

function sortByKey(records: SpaceRecord[]): SpaceRecord[] {
  return records.sort((a, b) => b.rkey.localeCompare(a.rkey));
}
