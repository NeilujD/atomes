// Test fake: the Atomes instance, signed in as `owner`, with the real Library
// API and store (src/lib/server/) over an in-memory SQLite file. By default any
// record of any collection is accepted, so the queue tests can use simple
// records; pass `lexiconRules` for the server's real check.
import { handleLibraryRequest, libraryPath, type RecordRules } from '../server/library-api';
import { createLibraryStore } from '../server/library-store';
import type { FetchHandler } from './space';
import type { FakeStoreServer } from './store-server.fake';

const anyRecord: RecordRules = { isCollection: () => true, assertValid: () => {} };

export function fakeInstance(owner: string, rules: RecordRules = anyRecord): FakeStoreServer & { calls: string[] } {
  const store = createLibraryStore(':memory:');
  const calls: string[] = [];
  const writes: string[] = [];
  const network: FakeStoreServer['network'] = { online: true };

  const handler: FetchHandler = async (pathname, init) => {
    if (!network.online) throw new TypeError('Failed to fetch');
    calls.push(pathname);
    if (network.failing) {
      return Response.json({ error: 'InternalServerError', message: 'Internal Server Error' }, { status: network.failing });
    }
    const request = new Request(new URL(pathname, 'https://atomes.test'), init);
    const response = await handleLibraryRequest(request, { did: owner, store, rules });
    const method = request.method;
    if (response.ok && (method === 'PUT' || method === 'DELETE')) {
      const rkey = decodeURIComponent(new URL(request.url).pathname.slice(libraryPath.length).split('/')[1]);
      writes.push(`${method === 'PUT' ? 'put' : 'delete'} ${rkey}`);
    }
    return response;
  };
  return { handler, calls, writes, network };
}
