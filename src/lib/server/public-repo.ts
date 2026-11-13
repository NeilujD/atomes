// The reader's public repo on their PDS, where Shared records live (ADR 0003,
// ADR 0013). The server calls it with the reader's OAuth session
// (`session.fetchHandler`, oauth.ts). It refuses, before any call, every
// collection that is never Shared: Copies, Loans and To Buy stay off the PDS
// whatever the caller asks.
import { sharedCollections } from '../sharing/categories';
import type { FetchHandler } from '../space/space';

export interface PublicRepo {
  // Every record of the collection, all pages.
  list(collection: string): Promise<{ rkey: string; value: unknown }[]>;
  put(collection: string, rkey: string, record: object): Promise<void>;
  // Deleting a record that is not there succeeds.
  delete(collection: string, rkey: string): Promise<void>;
}

export class PdsError extends Error {
  constructor(
    readonly status: number,
    readonly error: string,
  ) {
    super(`PDS answered ${status} ${error}`);
    this.name = 'PdsError';
  }
}

export function publicRepo(fetchHandler: FetchHandler, did: string): PublicRepo {
  function shared(collection: string) {
    if (!sharedCollections.includes(collection)) throw new Error(`${collection} is never Shared`);
  }

  // Answers carry no record value in errors: only the XRPC error name.
  async function call(pathname: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const response = await fetchHandler(pathname, init);
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (response.ok) return payload;
    throw new PdsError(response.status, typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`);
  }

  const post = (method: string, body: object) =>
    call(`/xrpc/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  return {
    async list(collection) {
      shared(collection);
      const records: { rkey: string; value: unknown }[] = [];
      let cursor: string | undefined;
      do {
        const query = new URLSearchParams({ repo: did, collection, limit: '100' });
        if (cursor) query.set('cursor', cursor);
        const page = (await call(`/xrpc/com.atproto.repo.listRecords?${query}`)) as {
          records?: { uri: string; value: unknown }[];
          cursor?: string;
        };
        const found = page.records ?? [];
        for (const { uri, value } of found) records.push({ rkey: uri.slice(uri.lastIndexOf('/') + 1), value });
        cursor = found.length > 0 ? page.cursor : undefined;
      } while (cursor);
      return records;
    },
    async put(collection, rkey, record) {
      shared(collection);
      await post('com.atproto.repo.putRecord', { repo: did, collection, rkey, record });
    },
    async delete(collection, rkey) {
      shared(collection);
      try {
        await post('com.atproto.repo.deleteRecord', { repo: did, collection, rkey });
      } catch (error) {
        if (!(error instanceof PdsError && error.error === 'RecordNotFound')) throw error;
      }
    },
  };
}
