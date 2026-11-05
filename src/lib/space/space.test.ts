import { afterEach, describe, expect, test, vi } from 'vitest';
import { memoryLocalCopy } from './local-copy.fake';
import { newRecordKey, openSpace, SpaceError, spaceErrorMessage, type FetchHandler } from './space';

const owner = 'did:plc:owner';
const collection = 'app.atomes.copy';

// An in-memory PDS that answers the com.atproto.space.* calls the way the
// alpha PDS does (lexicons and handlers on bluesky-social/atproto, branch
// permissioned-data at d009736). Everything else is a public repo call.
// `online = false` stands for the network off: fetch() rejects with a TypeError.
function fakePds() {
  const spaces = new Map<string, { spaceType: string; policy: unknown }>();
  // space ref -> "collection/rkey" -> value. Only the owner writes here.
  const records = new Map<string, Map<string, unknown>>();
  const calls: string[] = [];

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
        return reply(200, { uri: `${body.space}/${owner}/${body.collection}/${body.rkey}`, cid: 'bafyfake' });
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

  const network = { online: true };
  const handler: FetchHandler = (pathname, init) =>
    network.online ? Promise.resolve(answer(pathname, init)) : Promise.reject(new TypeError('Failed to fetch'));
  return { handler, spaces, calls, network };
}

const textsOf = (records: { value: unknown }[]) => records.map(({ value }) => (value as { text: string }).text);

describe('Space', () => {
  test('reading before the first save gives nothing and creates no Space', async () => {
    const pds = fakePds();
    const space = openSpace(pds.handler, owner, memoryLocalCopy());

    expect(await space.list(collection)).toEqual({ records: [], stale: false });
    expect(await space.get(collection, 'missing')).toBeUndefined();
    expect(pds.spaces.size).toBe(0);
  });

  test('the first save creates one private Space; the record reads back after a reload', async () => {
    const pds = fakePds();
    const rkey = newRecordKey();

    await openSpace(pds.handler, owner, memoryLocalCopy()).put(collection, rkey, {
      text: 'hello',
      createdAt: '2026-11-04T10:00:00.000Z',
    });

    expect([...pds.spaces.entries()]).toEqual([
      [
        `at://${owner}/space/app.atomes.library/self`,
        { spaceType: 'app.atomes.library', policy: { $type: 'com.atproto.personalspace.policy' } },
      ],
    ]);
    // A new Space object on the same PDS stands for a reload.
    const reloaded = openSpace(pds.handler, owner, memoryLocalCopy());
    const value = { $type: collection, text: 'hello', createdAt: '2026-11-04T10:00:00.000Z' };
    expect(await reloaded.get(collection, rkey)).toEqual(value);
    expect(await reloaded.list(collection)).toEqual({ records: [{ rkey, value }], stale: false });
  });

  test('later saves reuse the Space', async () => {
    const pds = fakePds();
    const space = openSpace(pds.handler, owner, memoryLocalCopy());

    await space.put(collection, newRecordKey(), { text: 'one' });
    await space.put(collection, newRecordKey(), { text: 'two' });
    await space.ensure();

    expect(pds.spaces.size).toBe(1);
    expect((await space.list(collection)).records).toHaveLength(2);
  });

  test('list reads every page', async () => {
    const pds = fakePds();
    const space = openSpace(pds.handler, owner, memoryLocalCopy());
    for (let i = 0; i < 120; i++) await space.put(collection, newRecordKey(), { text: `${i}` });

    expect((await space.list(collection)).records).toHaveLength(120);
  });

  test('a PDS error is a SpaceError with the XRPC error name', async () => {
    const handler: FetchHandler = () =>
      Promise.resolve(Response.json({ error: 'InvalidToken', message: 'Bad token scope' }, { status: 401 }));

    const error = await openSpace(handler, owner, memoryLocalCopy())
      .list(collection)
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(SpaceError);
    expect(error).toMatchObject({ error: 'InvalidToken', message: 'Bad token scope' });
  });
});

// The local copy on the device. A new Space on the same copy stands for a reload.
describe('with the network off', () => {
  test('list gives the records last read, marked stale, after a reload', async () => {
    const pds = fakePds();
    const copy = memoryLocalCopy();
    const space = openSpace(pds.handler, owner, copy);
    await space.put(collection, newRecordKey(), { text: 'one' });
    await space.put(collection, newRecordKey(), { text: 'two' });
    const online = await space.list(collection);

    pds.network.online =false;
    const offline = await openSpace(pds.handler, owner, copy).list(collection);

    expect(online.stale).toBe(false);
    expect(offline).toEqual({ records: online.records, stale: true });
    expect(textsOf(offline.records)).toEqual(['two', 'one']);
  });

  test('a record saved online shows offline with no further list (write-through)', async () => {
    const pds = fakePds();
    const copy = memoryLocalCopy();
    const space = openSpace(pds.handler, owner, copy);
    const first = newRecordKey();
    await space.put(collection, first, { text: 'one' });
    await space.list(collection);
    await space.put(collection, newRecordKey(), { text: 'two' });
    await space.put(collection, first, { text: 'one, edited' });

    // Read the PDS through another copy, so this copy holds only what write-through put in it.
    const fromPds = await openSpace(pds.handler, owner, memoryLocalCopy()).list(collection);
    pds.network.online =false;
    const offline = await openSpace(pds.handler, owner, copy).list(collection);

    expect(textsOf(offline.records)).toEqual(['two', 'one, edited']);
    expect(offline.records).toEqual(fromPds.records);
  });

  test('a save fails visibly, and nothing is kept or queued', async () => {
    const pds = fakePds();
    const copy = memoryLocalCopy();
    const space = openSpace(pds.handler, owner, copy);
    await space.put(collection, newRecordKey(), { text: 'one' });
    await space.list(collection);

    pds.network.online =false;
    const error = await space.put(collection, newRecordKey(), { text: 'lost' }).catch((cause: unknown) => cause);

    expect(spaceErrorMessage(error)).toBe('Could not reach your PDS. Check your connection and try again.');
    expect(textsOf((await space.list(collection)).records)).toEqual(['one']);
    pds.network.online =true;
    expect(await space.list(collection)).toMatchObject({ stale: false });
    expect(textsOf((await space.list(collection)).records)).toEqual(['one']);
  });

  test('a token refresh that cannot reach the server also falls back to the copy', async () => {
    const pds = fakePds();
    const copy = memoryLocalCopy();
    await openSpace(pds.handler, owner, copy).put(collection, newRecordKey(), { text: 'one' });
    await openSpace(pds.handler, owner, copy).list(collection);
    // What the OAuth client throws: its own error, with the fetch TypeError as cause.
    const refreshFails: FetchHandler = () =>
      Promise.reject(new Error('Failed to fetch', { cause: new TypeError('Failed to fetch') }));

    expect(await openSpace(refreshFails, owner, copy).list(collection)).toMatchObject({ stale: true });
  });

  test('list fails when this device has no copy yet', async () => {
    const pds = fakePds();
    pds.network.online =false;

    await expect(openSpace(pds.handler, owner, memoryLocalCopy()).list(collection)).rejects.toThrow(TypeError);
  });

  test('another account on the device never gets the copy', async () => {
    const pds = fakePds();
    const copy = memoryLocalCopy();
    await openSpace(pds.handler, owner, copy).put(collection, newRecordKey(), { text: 'private' });
    await openSpace(pds.handler, owner, copy).list(collection);

    pds.network.online =false;

    await expect(openSpace(pds.handler, 'did:plc:other', copy).list(collection)).rejects.toThrow(TypeError);
  });

  test('an answer from the PDS is never hidden behind the copy', async () => {
    const pds = fakePds();
    const copy = memoryLocalCopy();
    await openSpace(pds.handler, owner, copy).put(collection, newRecordKey(), { text: 'one' });
    await openSpace(pds.handler, owner, copy).list(collection);
    const refused: FetchHandler = () => Promise.resolve(Response.json({ error: 'InvalidToken' }, { status: 401 }));

    await expect(openSpace(refused, owner, copy).list(collection)).rejects.toThrow(SpaceError);
  });

  test('a cleared copy (sign-out) shows nothing', async () => {
    const pds = fakePds();
    const copy = memoryLocalCopy();
    await openSpace(pds.handler, owner, copy).put(collection, newRecordKey(), { text: 'private' });
    await openSpace(pds.handler, owner, copy).list(collection);

    await copy.clear();
    pds.network.online =false;

    await expect(openSpace(pds.handler, owner, copy).list(collection)).rejects.toThrow(TypeError);
  });
});

describe('record data', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('goes only to the Space on the PDS: no public repo call, nothing sent to the Atomes server', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    const pds = fakePds();
    const space = openSpace(pds.handler, owner, memoryLocalCopy());

    const rkey = newRecordKey();
    await space.put(collection, rkey, { text: 'private' });
    await space.get(collection, rkey);
    await space.list(collection);

    expect(pds.calls.length).toBeGreaterThan(0);
    expect(pds.calls.every((call) => call.startsWith('/xrpc/com.atproto.space.'))).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('newRecordKey', () => {
  test('gives TIDs that sort in creation order', () => {
    const keys = Array.from({ length: 50 }, () => newRecordKey());

    for (const key of keys) expect(key).toMatch(/^[234567abcdefghij][234567abcdefghijklmnopqrstuvwxyz]{12}$/);
    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('spaceErrorMessage', () => {
  test.each([
    ['the PDS refuses the call', new SpaceError('InvalidToken', 'Bad token scope'), 'Your PDS refused the request: Bad token scope'],
    ['the network is down', new TypeError('Failed to fetch'), 'Could not reach your PDS. Check your connection and try again.'],
    [
      'a token refresh cannot reach the server',
      new Error('Failed to fetch', { cause: new TypeError('Failed to fetch') }),
      'Could not reach your PDS. Check your connection and try again.',
    ],
    ['anything else', new Error('boom'), 'Something went wrong with your private Space. Try again.'],
  ])('%s', (_, error, message) => {
    expect(spaceErrorMessage(error)).toBe(message);
  });
});
