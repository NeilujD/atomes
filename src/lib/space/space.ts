// Library record stores on the device. The app uses the instance store
// (instance-store.ts, ADR 0012). The Space store below is kept for the move to
// atproto Spaces (ADR 0003); the app makes no Space calls until then.
//
// The Space store: the only code that knows the Spaces alpha calls
// (com.atproto.space.*). Calls go from the browser straight to the PDS through
// an OAuth session. Wire shapes: lexicons on bluesky-social/atproto, branch
// permissioned-data at d009736.
import { t } from '../i18n/i18n';
import { isNetworkFailure } from '../network';
import type { LocalCopy } from './local-copy';
import { openQueuedStore, RefusedError, SignedOutError, UnavailableError, type Remote, type Space, type SpaceRecord } from './queued-store';

export {
  isTemporaryFailure,
  RefusedError,
  SignedOutError,
  UnavailableError,
  type Listing,
  type PendingWrite,
  type Space,
  type SpaceRecord,
  type StaleWrite,
  type WriteState,
} from './queued-store';

// Sends a request to the store: a DPoP-signed one to the PDS
// (`OAuthSession.fetchHandler`), or a same-origin one to the Atomes server.
export type FetchHandler = (pathname: string, init?: RequestInit) => Promise<Response>;

// One-member Space: only its owner can read it (personalspace policy).
const spaceType = 'app.atomes.library';
const skey = 'self';
const policy = { $type: 'com.atproto.personalspace.policy' };

// What the PDS answers before the Space exists, or before the first write in it.
const notCreatedYet = ['SpaceNotFound', 'RepoNotFound'];

// The PDS refused the call (HTTP 4xx).
export class SpaceError extends RefusedError {
  constructor(error: string, message: string) {
    super(error, message);
    this.name = 'SpaceError';
  }
}

// The PDS was reached but could not do the work now (HTTP 5xx or 429).
export class PdsUnavailableError extends UnavailableError {
  constructor(status: number, message: string) {
    super(status, message);
    this.name = 'PdsUnavailableError';
  }
}

export function openSpace(fetchHandler: FetchHandler, did: string, localCopy: LocalCopy): Space {
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
      const message = typeof payload.message === 'string' ? payload.message : error;
      if (response.status >= 500 || response.status === 429) throw new PdsUnavailableError(response.status, message);
      throw new SpaceError(error, message);
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

  const remote: Remote = {
    ensure,
    async put(collection, rkey, record) {
      // validate: false, as the reference app does: the PDS stores the record as is.
      const body = { space, repo: did, collection, rkey, validate: false, record };
      try {
        await call('putRecord', { body });
      } catch (error) {
        if (!(error instanceof SpaceError && error.error === 'SpaceNotFound')) throw error;
        await ensure();
        await call('putRecord', { body });
      }
    },
    async delete(collection, rkey) {
      try {
        await call('deleteRecord', { body: { space, repo: did, collection, rkey } });
      } catch (error) {
        // No Space yet: nothing to delete.
        if (!(error instanceof SpaceError && notCreatedYet.includes(error.error))) throw error;
      }
    },
    async get(collection, rkey) {
      try {
        const payload = await call('getRecord', { query: { space, repo: did, collection, rkey } });
        return payload.value;
      } catch (error) {
        if (error instanceof SpaceError && [...notCreatedYet, 'RecordNotFound'].includes(error.error)) return undefined;
        throw error;
      }
    },
    async list(collection) {
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
    },
  };

  // Same local copy keys as before the queue moved to queued-store.ts.
  return openQueuedStore(remote, space, localCopy);
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

// Names what failed: the session, the reader's PDS, the Atomes server, or the network.
export function spaceErrorMessage(error: unknown): string {
  if (error instanceof SignedOutError) return t('auth.session-ended');
  if (error instanceof SpaceError) return t('error.pds-refused-request', error.message);
  if (error instanceof PdsUnavailableError) return t('error.pds-problem', error.message);
  if (error instanceof RefusedError) return t('error.server-refused-request', error.message);
  if (error instanceof UnavailableError) return t('error.server-problem', error.message);
  // The device calls only the Atomes server (ADR 0013).
  if (isNetworkFailure(error)) return t('error.server-unreachable');
  return t('error.space-failed');
}
