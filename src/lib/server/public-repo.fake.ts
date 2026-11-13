// Test fake: the public repo of one account on a PDS, answering the
// com.atproto.repo.* calls the server makes to share (public-repo.ts). The
// tests read `records` to see what anyone could read.
import type { FetchHandler } from '../space/space';

export interface FakePublicRepo {
  handler: FetchHandler;
  // "collection/rkey" -> record, as anyone reads it.
  records: Map<string, unknown>;
  calls: string[];
  // Offline: every call fails as fetch does. `failAfter`: that many writes
  // succeed, then every call answers 500.
  network: { online: boolean; failAfter?: number };
}

export function fakePublicRepo(did: string): FakePublicRepo {
  const records = new Map<string, unknown>();
  const calls: string[] = [];
  const network: FakePublicRepo['network'] = { online: true };
  let writes = 0;

  const reply = (status: number, body: unknown) => Response.json(body, { status });
  const fail = (status: number, error: string) => reply(status, { error, message: `${error} (fake PDS)` });

  function answer(pathname: string, init?: RequestInit): Response {
    const url = new URL(pathname, 'https://pds.test');
    calls.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
    const repo = url.pathname.endsWith('listRecords') ? url.searchParams.get('repo') : body.repo;
    if (repo !== did) return fail(403, 'Forbidden');

    switch (url.pathname) {
      case '/xrpc/com.atproto.repo.listRecords': {
        const collection = url.searchParams.get('collection');
        const limit = Number(url.searchParams.get('limit') ?? 50);
        const cursor = url.searchParams.get('cursor');
        const page = [...records.entries()]
          .map(([key, value]) => ({ collection: key.split('/')[0], rkey: key.split('/').slice(1).join('/'), value }))
          .filter((record) => record.collection === collection)
          .sort((a, b) => b.rkey.localeCompare(a.rkey))
          .filter((record) => !cursor || record.rkey < cursor)
          .slice(0, limit);
        return reply(200, {
          records: page.map(({ rkey, value }) => ({ uri: `at://${did}/${collection}/${rkey}`, cid: 'bafyfake', value })),
          cursor: page.length === limit ? page.at(-1)?.rkey : undefined,
        });
      }
      case '/xrpc/com.atproto.repo.putRecord':
        records.set(`${String(body.collection)}/${String(body.rkey)}`, body.record);
        return reply(200, { uri: `at://${did}/${String(body.collection)}/${String(body.rkey)}`, cid: 'bafyfake' });
      // Succeeds whether or not the record was there.
      case '/xrpc/com.atproto.repo.deleteRecord':
        records.delete(`${String(body.collection)}/${String(body.rkey)}`);
        return reply(200, {});
      default:
        return fail(501, 'MethodNotImplemented');
    }
  }

  const handler: FetchHandler = (pathname, init) => {
    if (!network.online) return Promise.reject(new TypeError('fetch failed'));
    const write = init?.method === 'POST';
    if (network.failAfter !== undefined && writes >= network.failAfter) {
      calls.push(`failed ${pathname}`);
      return Promise.resolve(fail(500, 'InternalServerError'));
    }
    if (write) writes += 1;
    return Promise.resolve(answer(pathname, init));
  };
  return { handler, records, calls, network };
}
