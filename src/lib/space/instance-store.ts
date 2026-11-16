// The Library store the app uses: the reader's Private records on the Atomes
// instance (ADR 0012, ADR 0016), through its API (src/lib/server/library-api.ts),
// with the local copy and write queue of queued-store.ts.
import type { LocalCopy } from './local-copy';
import {
  openQueuedStore,
  RefusedError,
  SignedOutError,
  StaleError,
  UnavailableError,
  type Changes,
  type Remote,
  type Space,
  type SpaceRecord,
  type FetchHandler,
  type StaleWrite,
} from './queued-store';

const apiPath = '/api/library';

// Same-origin: the browser sends the session cookie, and no token.
export const instanceFetch: FetchHandler = (pathname, init) => fetch(pathname, { ...init, credentials: 'same-origin' });

// The name of the store of an Account in the local copy. A device of before
// Accounts kept it under the reader's DID; server-client.ts moves it.
export const instanceOwner = (account: string) => `atomes-instance:${account}`;

// `account`: the key of the local copy, the Account ID (or, on a device that
// has not seen the server since Accounts, the DID).
// `onStale`: a write refused because another device changed the record first.
export function openInstanceStore(
  fetchHandler: FetchHandler,
  account: string,
  localCopy: LocalCopy,
  onStale?: (write: StaleWrite) => void,
): Space {
  const path = (collection: string, rkey?: string) =>
    `${apiPath}/${encodeURIComponent(collection)}${rkey === undefined ? '' : `/${encodeURIComponent(rkey)}`}`;

  async function call(pathname: string, init: RequestInit = { method: 'GET' }) {
    const response = await fetchHandler(pathname, init);
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (response.ok) return payload;
    const error = typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`;
    const message = typeof payload.message === 'string' ? payload.message : error;
    if (response.status === 401) throw new SignedOutError(message);
    if (response.status >= 500 || response.status === 429) throw new UnavailableError(response.status, message);
    if (response.status === 409) throw new StaleError(message);
    throw new RefusedError(error, message);
  }

  // The rev the write is based on, when the device has one (ADR 0012).
  const basedOn = (rev: number | undefined) => (rev === undefined ? '' : `?rev=${rev}`);
  const revOf = (payload: Record<string, unknown>) => (typeof payload.rev === 'number' ? payload.rev : undefined);

  const remote: Remote = {
    ensure: () => Promise.resolve(),
    async put(collection, rkey, record, base) {
      return revOf(
        await call(`${path(collection, rkey)}${basedOn(base)}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(record),
        }),
      );
    },
    async delete(collection, rkey, base) {
      return revOf(await call(`${path(collection, rkey)}${basedOn(base)}`, { method: 'DELETE' }));
    },
    changes: async (since) => (await call(`${apiPath}?since=${since}`)) as unknown as Changes,
    async get(collection, rkey) {
      try {
        return (await call(path(collection, rkey))).value;
      } catch (error) {
        if (error instanceof RefusedError && error.error === 'RecordNotFound') return undefined;
        throw error;
      }
    },
    async list(collection) {
      return (await call(path(collection))).records as SpaceRecord[];
    },
  };

  return openQueuedStore(remote, instanceOwner(account), localCopy, onStale);
}
