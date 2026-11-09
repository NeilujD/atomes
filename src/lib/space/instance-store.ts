// The Library store the app uses: the reader's Private records on the Atomes
// instance (ADR 0012), through its API (src/lib/server/library-api.ts). Same
// `Space` contract, local copy and write queue as the Space store, so the
// screens do not change and the move to Spaces later is a store swap.
import type { LocalCopy } from './local-copy';
import { openQueuedStore, RefusedError, SignedOutError, UnavailableError, type Remote, type Space, type SpaceRecord } from './queued-store';
import type { FetchHandler } from './space';

const base = '/api/library';

// Same-origin: the browser sends the session cookie, and no token.
export const instanceFetch: FetchHandler = (pathname, init) => fetch(pathname, { ...init, credentials: 'same-origin' });

export function openInstanceStore(fetchHandler: FetchHandler, did: string, localCopy: LocalCopy): Space {
  const path = (collection: string, rkey?: string) =>
    `${base}/${encodeURIComponent(collection)}${rkey === undefined ? '' : `/${encodeURIComponent(rkey)}`}`;

  async function call(pathname: string, init: RequestInit = { method: 'GET' }) {
    const response = await fetchHandler(pathname, init);
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (response.ok) return payload;
    const error = typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`;
    const message = typeof payload.message === 'string' ? payload.message : error;
    if (response.status === 401) throw new SignedOutError(message);
    if (response.status >= 500 || response.status === 429) throw new UnavailableError(response.status, message);
    throw new RefusedError(error, message);
  }

  const remote: Remote = {
    ensure: () => Promise.resolve(),
    async put(collection, rkey, record) {
      await call(path(collection, rkey), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(record),
      });
    },
    async delete(collection, rkey) {
      await call(path(collection, rkey), { method: 'DELETE' });
    },
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

  return openQueuedStore(remote, `atomes-instance:${did}`, localCopy);
}
