// The reader's private Space on their PDS: the only code that knows the
// Spaces alpha calls (com.atproto.space.*), so a Thursday alpha change is
// fixed here. Calls go from the browser straight to the PDS through the OAuth
// session; the Atomes server never sees record data (ADR 0001, ADR 0003).
// Wire shapes: lexicons on bluesky-social/atproto, branch permissioned-data at d009736.
// Behind it, a local copy on the device keeps the last records read, for offline
// reads, and the writes not sent yet, for offline writes (ADR 0002).
import { ClientMetadataError } from '../auth/client-metadata';
import { isNetworkFailure } from '../network';
import type { LocalCopy } from './local-copy';

// `OAuthSession.fetchHandler`: sends a DPoP-signed request to the reader's PDS.
export type FetchHandler = (pathname: string, init?: RequestInit) => Promise<Response>;

export interface SpaceRecord {
  rkey: string;
  value: unknown;
}

export interface Listing {
  records: SpaceRecord[];
  // True when the PDS could not be reached: the records are the local copy,
  // as last read on this device with the waiting writes in it, and may be out of date.
  stale: boolean;
}

// A put or a delete kept on this device until the PDS has it.
export interface PendingWrite {
  collection: string;
  rkey: string;
  // The record to put; none for a delete.
  record?: Record<string, unknown>;
  // Set when the PDS refused the write: its reason. A refused write is not sent again.
  refused?: string;
}

// sent: the PDS has it. waiting: kept on this device, sent when the network
// returns. refused: the PDS refused it; it stays in `pending()` with the reason.
export type WriteState = 'sent' | 'waiting' | 'refused';

export interface Space {
  // Creates the Space if it does not exist yet.
  ensure(): Promise<void>;
  // Writes a record; creates the Space on the first write. With no network the
  // write waits on this device, in order, and the local copy shows it at once.
  // Last write wins: a newer write to the same record replaces a waiting one.
  put(collection: string, rkey: string, value: Record<string, unknown>): Promise<WriteState>;
  // Deletes a record, as put does: waits on this device with no network. Deleting a
  // record that does not exist succeeds.
  delete(collection: string, rkey: string): Promise<WriteState>;
  // Undefined when the record, or the Space, does not exist. Reads the PDS only,
  // so it does not see the waiting writes.
  get(collection: string, rkey: string): Promise<unknown>;
  // Every record of the collection, waiting writes included; empty when the Space
  // does not exist. Sends the waiting writes first.
  // With no network: the local copy, marked stale, if this device has one.
  list(collection: string): Promise<Listing>;
  // Sends the waiting writes, oldest first. Stops at the first network failure.
  sendWaiting(): Promise<void>;
  // The writes not sent: waiting ones and refused ones, oldest first.
  pending(): Promise<PendingWrite[]>;
}

// One-member Space: only its owner can read it (personalspace policy).
const spaceType = 'app.atomes.library';
const skey = 'self';
const policy = { $type: 'com.atproto.personalspace.policy' };

// What the PDS answers before the Space exists, or before the first write in it.
const notCreatedYet = ['SpaceNotFound', 'RepoNotFound'];

export class SpaceError extends Error {
  constructor(
    readonly error: string,
    message: string,
  ) {
    super(message);
    this.name = 'SpaceError';
  }
}

export function openSpace(fetchHandler: FetchHandler, did: string, localCopy: LocalCopy): Space {
  const space = `at://${did}/space/${spaceType}/${skey}`;
  // One entry per account and collection: another account never sees these records.
  const copyKey = (collection: string) => `${space}/${collection}`;
  const queueKey = `${space}#pending`;

  // Queue changes and sends run one at a time, so the writes go out in order.
  let turn: Promise<unknown> = Promise.resolve();
  function inTurn<T>(task: () => Promise<T>): Promise<T> {
    const result = turn.then(task);
    turn = result.catch(() => undefined);
    return result;
  }

  async function call(method: string, init: { query?: Record<string, string>; body?: unknown }) {
    const query = init.query ? `?${new URLSearchParams(init.query).toString()}` : '';
    const response = await fetchHandler(
      `/xrpc/com.atproto.space.${method}${query}`,
      init.body === undefined
        ? { method: 'GET' }
        : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(init.body) },
    );
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const error = typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`;
      throw new SpaceError(error, typeof payload.message === 'string' ? payload.message : error);
    }
    return payload;
  }

  async function ensure() {
    try {
      await call('createSpace', { body: { spaceType, skey, policy } });
    } catch (error) {
      if (!(error instanceof SpaceError && error.error === 'SpaceAlreadyExists')) throw error;
    }
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
        const queue = await localCopy.readQueue(queueKey);
        const next = queue.find((pending) => pending.refused === undefined);
        if (!next) return;
        let refused: string | undefined;
        try {
          await send(next);
        } catch (error) {
          // Kept as is: sent when the network returns.
          if (isNetworkFailure(error)) return;
          if (!(error instanceof SpaceError)) throw error;
          refused = error.message;
        }
        await localCopy.writeQueue(
          queueKey,
          refused === undefined
            ? queue.filter((pending) => pending !== next)
            : queue.map((pending) => (pending === next ? { ...pending, refused } : pending)),
        );
      }
    });
  }

  async function send({ collection, rkey, record }: PendingWrite) {
    const target = { space, repo: did, collection, rkey };
    if (!record) {
      try {
        await call('deleteRecord', { body: target });
      } catch (error) {
        // No Space yet: nothing to delete.
        if (!(error instanceof SpaceError && notCreatedYet.includes(error.error))) throw error;
      }
      return;
    }
    // validate: false, as the reference app does: the PDS stores the record as is.
    const body = { ...target, validate: false, record };
    try {
      await call('putRecord', { body });
    } catch (error) {
      if (!(error instanceof SpaceError && error.error === 'SpaceNotFound')) throw error;
      await ensure();
      await call('putRecord', { body });
    }
  }

  async function get(collection: string, rkey: string) {
    try {
      const payload = await call('getRecord', { query: { space, repo: did, collection, rkey } });
      return payload.value;
    } catch (error) {
      if (error instanceof SpaceError && [...notCreatedYet, 'RecordNotFound'].includes(error.error)) return undefined;
      throw error;
    }
  }

  async function list(collection: string): Promise<Listing> {
    await sendWaiting();
    let fromPds: SpaceRecord[];
    try {
      fromPds = await listFromPds(collection);
    } catch (error) {
      const copy = isNetworkFailure(error) ? await localCopy.read(copyKey(collection)) : undefined;
      if (!copy) throw error;
      return { records: copy, stale: true };
    }
    // In turn, so a write made during the list is not lost from the copy.
    return inTurn(async () => {
      const waiting = (await localCopy.readQueue(queueKey)).filter(
        (pending) => pending.collection === collection && pending.refused === undefined,
      );
      const records = withWrites(fromPds, waiting);
      await localCopy.write(copyKey(collection), records);
      return { records, stale: false };
    });
  }

  async function listFromPds(collection: string) {
    const records: SpaceRecord[] = [];
    let cursor: string | undefined;
    try {
      do {
        const query: Record<string, string> = { space, repo: did, collection, limit: '100' };
        if (cursor) query.cursor = cursor;
        const page = (await call('listRecords', { query })) as { records: SpaceRecord[]; cursor?: string };
        records.push(...page.records.map(({ rkey, value }) => ({ rkey, value })));
        cursor = page.cursor;
      } while (cursor);
    } catch (error) {
      if (error instanceof SpaceError && notCreatedYet.includes(error.error)) return [];
      throw error;
    }
    return records;
  }

  return {
    ensure,
    put: (collection, rkey, value) => write({ collection, rkey, record: { $type: collection, ...value } }),
    delete: (collection, rkey) => write({ collection, rkey }),
    get,
    list,
    sendWaiting,
    pending: () => localCopy.readQueue(queueKey),
  };
}

// The records of one collection with these writes of the same collection applied
// in order. Newest key first, as the PDS lists them.
function withWrites(records: SpaceRecord[], writes: PendingWrite[]): SpaceRecord[] {
  let result = [...records];
  for (const { rkey, record } of writes) {
    result = result.filter((kept) => kept.rkey !== rkey);
    if (record) result.push({ rkey, value: record });
  }
  return result.sort((a, b) => b.rkey.localeCompare(a.rkey));
}

// Record key: a TID (base32-sortable microseconds and a clock id), so keys sort
// in creation order. https://atproto.com/specs/tid
const base32Sortable = '234567abcdefghijklmnopqrstuvwxyz';
const clockId = BigInt(Math.floor(Math.random() * 1024));
let lastMicros = 0n;

export function newRecordKey(): string {
  // Strictly increasing, even for two keys in the same millisecond.
  const now = BigInt(Date.now()) * 1000n;
  lastMicros = now > lastMicros ? now : lastMicros + 1n;
  let value = (lastMicros << 10n) | clockId;
  let key = '';
  for (let i = 0; i < 13; i++) {
    key = base32Sortable[Number(value & 31n)] + key;
    value >>= 5n;
  }
  return key;
}

// Names what failed: the Atomes server, the reader's PDS, or the network.
export function spaceErrorMessage(error: unknown): string {
  // First: an unreachable Atomes server is also a network failure, but not the PDS's.
  if (error instanceof ClientMetadataError) {
    return error.reachable
      ? 'This Atomes server is not set up correctly. Tell its owner.'
      : 'Could not reach this Atomes server. Check your connection and try again.';
  }
  if (error instanceof SpaceError) return `Your PDS refused the request: ${error.message}`;
  if (isNetworkFailure(error)) return 'Could not reach your PDS. Check your connection and try again.';
  return 'Something went wrong with your private Space. Try again.';
}
