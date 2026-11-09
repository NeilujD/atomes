// Test fake: an in-memory PDS that answers the com.atproto.space.* calls the
// way the alpha PDS does (lexicons and handlers on bluesky-social/atproto,
// branch permissioned-data at d009736). Everything else is a public repo call.
import type { FetchHandler } from './space';
import type { FakeStoreServer } from './store-server.fake';

export function fakePds(owner: string): FakeStoreServer & { spaces: Map<string, { spaceType: string; policy: unknown }>; calls: string[] } {
  const spaces = new Map<string, { spaceType: string; policy: unknown }>();
  // space ref -> "collection/rkey" -> value. Only the owner writes here.
  const records = new Map<string, Map<string, unknown>>();
  const calls: string[] = [];
  const writes: string[] = [];

  const reply = (status: number, body: unknown) => Response.json(body, { status });
  const fail = (error: string) => reply(400, { error, message: `${error} (fake PDS)` });

  // The PDS answers RepoNotFound until the account has written in the Space.
  function recordsOf(space: string | null, repo: string | null) {
    if (!space || !spaces.has(space)) return fail('SpaceNotFound');
    const written = records.get(space);
    if (repo !== owner || !written) return fail('RepoNotFound');
    return written;
  }

  function answer(pathname: string, init?: RequestInit): Response {
    calls.push(pathname);
    const url = new URL(pathname, 'https://pds.test');
    const query = url.searchParams;
    const body = init?.body ? (JSON.parse(init.body as string) as Record<string, string>) : {};

    switch (url.pathname) {
      case '/xrpc/com.atproto.space.createSpace': {
        const ref = `at://${owner}/space/${body.spaceType}/${body.skey}`;
        if (spaces.has(ref)) return fail('SpaceAlreadyExists');
        spaces.set(ref, { spaceType: body.spaceType, policy: body.policy });
        return reply(200, { uri: ref });
      }
      case '/xrpc/com.atproto.space.putRecord': {
        if (!spaces.has(body.space)) return fail('SpaceNotFound');
        if (body.repo !== owner) return reply(403, { error: 'Forbidden' });
        const written = records.get(body.space) ?? new Map<string, unknown>();
        records.set(body.space, written);
        written.set(`${body.collection}/${body.rkey}`, body.record);
        writes.push(`put ${body.rkey}`);
        return reply(200, { uri: `${body.space}/${owner}/${body.collection}/${body.rkey}`, cid: 'bafyfake' });
      }
      // Succeeds whether or not the record was there.
      case '/xrpc/com.atproto.space.deleteRecord': {
        if (!spaces.has(body.space)) return fail('SpaceNotFound');
        if (body.repo !== owner) return reply(403, { error: 'Forbidden' });
        records.get(body.space)?.delete(`${body.collection}/${body.rkey}`);
        writes.push(`delete ${body.rkey}`);
        return reply(200, {});
      }
      case '/xrpc/com.atproto.space.getRecord': {
        const written = recordsOf(query.get('space'), query.get('repo'));
        if (written instanceof Response) return written;
        const value = written.get(`${query.get('collection')}/${query.get('rkey')}`);
        if (value === undefined) return fail('RecordNotFound');
        return reply(200, { uri: 'at://ignored', cid: 'bafyfake', value });
      }
      case '/xrpc/com.atproto.space.listRecords': {
        const written = recordsOf(query.get('space'), query.get('repo'));
        if (written instanceof Response) return written;
        const limit = Number(query.get('limit') ?? 50);
        const cursor = query.get('cursor');
        const page = [...written.entries()]
          .map(([key, value]) => ({ collection: key.split('/')[0], rkey: key.split('/')[1], cid: 'bafyfake', value }))
          .filter((record) => record.collection === query.get('collection'))
          .sort((a, b) => b.rkey.localeCompare(a.rkey))
          .filter((record) => !cursor || record.rkey < cursor)
          .slice(0, limit);
        // Like the PDS: a cursor only when the page is full.
        return reply(200, { records: page, cursor: page.length === limit ? page.at(-1)?.rkey : undefined });
      }
      default:
        return reply(501, { error: 'MethodNotImplemented' });
    }
  }

  const network: FakeStoreServer['network'] = { online: true };
  const handler: FetchHandler = (pathname, init) => {
    if (!network.online) return Promise.reject(new TypeError('Failed to fetch'));
    if (network.failing) {
      calls.push(pathname);
      return Promise.resolve(reply(network.failing, { error: 'InternalServerError', message: 'Internal Server Error' }));
    }
    return Promise.resolve(answer(pathname, init));
  };
  return { handler, spaces, calls, writes, network };
}
