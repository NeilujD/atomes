// The reader's private Space on their PDS: the only code that knows the
// Spaces alpha calls (com.atproto.space.*), so a Thursday alpha change is
// fixed here. Calls go from the browser straight to the PDS through the OAuth
// session; the Atomes server never sees record data (ADR 0001, ADR 0003).
// Wire shapes: lexicons on bluesky-social/atproto, branch permissioned-data at d009736.

// `OAuthSession.fetchHandler`: sends a DPoP-signed request to the reader's PDS.
export type FetchHandler = (pathname: string, init?: RequestInit) => Promise<Response>;

export interface SpaceRecord {
  rkey: string;
  value: unknown;
}

export interface Space {
  // Creates the Space if it does not exist yet.
  ensure(): Promise<void>;
  // Writes a record; creates the Space on the first write.
  put(collection: string, rkey: string, value: Record<string, unknown>): Promise<void>;
  // Undefined when the record, or the Space, does not exist.
  get(collection: string, rkey: string): Promise<unknown>;
  // Every record of the collection; empty when the Space does not exist.
  list(collection: string): Promise<SpaceRecord[]>;
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

export function openSpace(fetchHandler: FetchHandler, did: string): Space {
  const space = `at://${did}/space/${spaceType}/${skey}`;

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

  async function put(collection: string, rkey: string, value: Record<string, unknown>) {
    // validate: false, as the reference app does: the PDS stores the record as is.
    const body = { space, repo: did, collection, rkey, validate: false, record: { $type: collection, ...value } };
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

  async function list(collection: string) {
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

  return { ensure, put, get, list };
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

export function spaceErrorMessage(error: unknown): string {
  if (error instanceof SpaceError) return `Your PDS refused the request: ${error.message}`;
  // fetch() rejects with a TypeError when offline or when the PDS refuses browser (CORS) calls.
  if (error instanceof TypeError) return 'Could not reach your PDS. Check your connection and try again.';
  return 'Something went wrong with your private Space. Try again.';
}
