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
}

export interface Listing {
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
}

// sent: the store has it. waiting: kept on this device, sent when the store can
// be reached and works again. refused: the store refused it; it stays in
// `pending()` with the reason.
export type WriteState = 'sent' | 'waiting' | 'refused';

export interface Space {
  // Prepares the store before the first write, when it needs it.
  ensure(): Promise<void>;
  // Writes a record. With no network, or while the store fails (`isTemporaryFailure`),
  // the write waits on this device, in order, and the local copy shows it at once.
  // Last write wins: a newer write to the same record replaces a waiting one.
  put(collection: string, rkey: string, value: Record<string, unknown>): Promise<WriteState>;
  // Deletes a record, as put does: waits on this device with no network. Deleting a
  // record that does not exist succeeds.
  delete(collection: string, rkey: string): Promise<WriteState>;
  // Undefined when the record does not exist. Reads the store only, so it does
  // not see the waiting writes.
  get(collection: string, rkey: string): Promise<unknown>;
  // Every record of the collection, waiting writes included. Sends the waiting writes first.
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
  put(collection: string, rkey: string, record: Record<string, unknown>): Promise<void>;
  delete(collection: string, rkey: string): Promise<void>;
  get(collection: string, rkey: string): Promise<unknown>;
  list(collection: string): Promise<SpaceRecord[]>;
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
// on the device never sees these records.
export function openQueuedStore(remote: Remote, owner: string, localCopy: LocalCopy): Space {
  const copyKey = (collection: string) => `${owner}/${collection}`;
  const queueKey = `${owner}#pending`;

  // Queue changes and sends run one at a time, so the writes go out in order.
  let turn: Promise<unknown> = Promise.resolve();
  function inTurn<T>(task: () => Promise<T>): Promise<T> {
    const result = turn.then(task);
    turn = result.catch(() => undefined);
    return result;
  }

  async function write(change: PendingWrite): Promise<WriteState> {
    await inTurn(async () => {
      const queue = await localCopy.readQueue(queueKey);
      const others = queue.filter((kept) => !(kept.collection === change.collection && kept.rkey === change.rkey));
      await localCopy.writeQueue(queueKey, [...others, change]);
      // Only into a copy that a full list filled: a copy with only this record
      // would look like the whole collection when offline.
      const copy = await localCopy.read(copyKey(change.collection));
      if (copy) await localCopy.write(copyKey(change.collection), withWrites(copy, [change]));
    });
    await sendWaiting();
    const kept = (await localCopy.readQueue(queueKey)).find(
      (pending) => pending.collection === change.collection && pending.rkey === change.rkey,
    );
    if (!kept) return 'sent';
    return kept.refused === undefined ? 'waiting' : 'refused';
  }

  function sendWaiting() {
    return inTurn(async () => {
      for (;;) {
        const next = (await localCopy.readQueue(queueKey)).find((pending) => pending.refused === undefined);
        if (!next) return;
        let refused: string | undefined;
        try {
          if (next.record) await remote.put(next.collection, next.rkey, next.record);
          else await remote.delete(next.collection, next.rkey);
        } catch (error) {
          // Kept as is: sent when the store can be reached and works again.
          if (isTemporaryFailure(error)) return;
          if (!(error instanceof RefusedError)) throw error;
          refused = error.message;
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
      }
    });
  }

  async function list(collection: string): Promise<Listing> {
    await sendWaiting();
    let fromStore: SpaceRecord[];
    try {
      fromStore = await remote.list(collection);
    } catch (error) {
      const copy = isTemporaryFailure(error) ? await localCopy.read(copyKey(collection)) : undefined;
      if (!copy) throw error;
      return { records: copy, stale: true };
    }
    // In turn, so a write made during the list is not lost from the copy.
    return inTurn(async () => {
      const waiting = (await localCopy.readQueue(queueKey)).filter(
        (pending) => pending.collection === collection && pending.refused === undefined,
      );
      const records = withWrites(fromStore, waiting);
      await localCopy.write(copyKey(collection), records);
      return { records, stale: false };
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
  return result.sort((a, b) => b.rkey.localeCompare(a.rkey));
}
