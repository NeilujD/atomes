import { afterEach, describe, expect, test, vi } from 'vitest';
import { ClientMetadataError } from '../auth/client-metadata';
import { memoryLocalCopy } from './local-copy.fake';
import { newRecordKey, openSpace, SpaceError, spaceErrorMessage, type FetchHandler } from './space';

const owner = 'did:plc:owner';
const collection = 'app.atomes.testItem';

// An in-memory PDS that answers the com.atproto.space.* calls the way the
// alpha PDS does (lexicons and handlers on bluesky-social/atproto, branch
// permissioned-data at d009736). Everything else is a public repo call.
// `online = false` stands for the network off: fetch() rejects with a TypeError.
function fakePds() {
  const spaces = new Map<string, { spaceType: string; policy: unknown }>();
  // space ref -> "collection/rkey" -> value. Only the owner writes here.
  const records = new Map<string, Map<string, unknown>>();
  const calls: string[] = [];
  // The writes the PDS applied, in order: "put <rkey>" or "delete <rkey>".
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

  const network = { online: true };
  const handler: FetchHandler = (pathname, init) =>
    network.online ? Promise.resolve(answer(pathname, init)) : Promise.reject(new TypeError('Failed to fetch'));
  return { handler, spaces, calls, writes, network };
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

describe('delete', () => {
  test('removes the record from the PDS, the listing and the local copy', async () => {
    const pds = fakePds();
    const copy = memoryLocalCopy();
    const space = openSpace(pds.handler, owner, copy);
    const kept = newRecordKey();
    const gone = newRecordKey();
    await space.put(collection, kept, { text: 'kept' });
    await space.put(collection, gone, { text: 'gone' });
    await space.list(collection);

    expect(await space.delete(collection, gone)).toBe('sent');

    expect(await space.get(collection, gone)).toBeUndefined();
    expect(textsOf((await openSpace(pds.handler, owner, memoryLocalCopy()).list(collection)).records)).toEqual(['kept']);
    pds.network.online = false;
    expect(textsOf((await openSpace(pds.handler, owner, copy).list(collection)).records)).toEqual(['kept']);
  });

  test('succeeds for a record that does not exist, and before the Space exists, and creates no Space', async () => {
    const pds = fakePds();
    const space = openSpace(pds.handler, owner, memoryLocalCopy());

    expect(await space.delete(collection, 'missing')).toBe('sent');
    expect(pds.spaces.size).toBe(0);
    await space.put(collection, newRecordKey(), { text: 'one' });
    expect(await space.delete(collection, 'missing')).toBe('sent');
    expect(await space.pending()).toEqual([]);
  });
});

// Writes made with no network wait on the device. A new Space on the same copy stands for a reload.
describe('offline writes', () => {
  // A Space whose collection copy is filled, then the network goes off.
  async function offlineSpace(...texts: string[]) {
    const pds = fakePds();
    const copy = memoryLocalCopy();
    const space = openSpace(pds.handler, owner, copy);
    const keys: string[] = [];
    for (const text of texts) {
      const rkey = newRecordKey();
      keys.push(rkey);
      await space.put(collection, rkey, { text });
    }
    await space.list(collection);
    pds.writes.length = 0;
    pds.network.online = false;
    return { pds, copy, space, keys };
  }

  test('a put waits, and the local copy shows it at once', async () => {
    const { pds, space } = await offlineSpace('one');

    expect(await space.put(collection, newRecordKey(), { text: 'two' })).toBe('waiting');

    expect(await space.list(collection)).toMatchObject({ stale: true });
    expect(textsOf((await space.list(collection)).records)).toEqual(['two', 'one']);
    expect(await space.pending()).toHaveLength(1);
    expect(pds.writes).toEqual([]);
  });

  test('a delete waits, and the local copy drops the record at once', async () => {
    const { pds, space, keys } = await offlineSpace('one', 'two');

    expect(await space.delete(collection, keys[0])).toBe('waiting');

    expect(textsOf((await space.list(collection)).records)).toEqual(['two']);
    expect(await space.pending()).toEqual([{ collection, rkey: keys[0] }]);
    pds.network.online = true;
    await space.sendWaiting();
    expect(pds.writes).toEqual([`delete ${keys[0]}`]);
    expect(textsOf((await space.list(collection)).records)).toEqual(['two']);
  });

  test('the waiting writes survive a reload and go out in the order they were made', async () => {
    const { pds, copy, space, keys } = await offlineSpace('one');
    const [a, b] = [newRecordKey(), newRecordKey()];
    await space.put(collection, b, { text: 'b' });
    await space.put(collection, a, { text: 'a' });
    await space.delete(collection, keys[0]);

    const reloaded = openSpace(pds.handler, owner, copy);
    expect((await reloaded.pending()).map(({ rkey }) => rkey)).toEqual([b, a, keys[0]]);
    pds.network.online = true;
    // A list with the network back sends them first.
    const listing = await reloaded.list(collection);

    expect(pds.writes).toEqual([`put ${b}`, `put ${a}`, `delete ${keys[0]}`]);
    expect(listing).toMatchObject({ stale: false });
    expect(textsOf(listing.records)).toEqual(['b', 'a']);
    expect(await reloaded.pending()).toEqual([]);
  });

  test('last write wins: a newer write to the same record replaces the waiting one', async () => {
    const { pds, space, keys } = await offlineSpace('one');
    const other = newRecordKey();
    await space.put(collection, keys[0], { text: 'first edit' });
    await space.put(collection, other, { text: 'other' });
    await space.put(collection, keys[0], { text: 'second edit' });

    expect(await space.pending()).toHaveLength(2);
    expect(textsOf((await space.list(collection)).records)).toEqual(['other', 'second edit']);
    pds.network.online = true;
    await space.sendWaiting();

    expect(pds.writes).toEqual([`put ${other}`, `put ${keys[0]}`]);
    expect(await space.get(collection, keys[0])).toMatchObject({ text: 'second edit' });
  });

  test('the network failing again stops the send and keeps the rest, in order', async () => {
    const { pds, copy, space } = await offlineSpace('one');
    const [a, b, c] = [newRecordKey(), newRecordKey(), newRecordKey()];
    for (const rkey of [a, b, c]) await space.put(collection, rkey, { text: rkey });
    // The network comes back for one call only.
    pds.network.online = true;
    const once: FetchHandler = (pathname, init) => {
      const answer = pds.handler(pathname, init);
      pds.network.online = false;
      return answer;
    };

    await openSpace(once, owner, copy).sendWaiting();

    expect(pds.writes).toEqual([`put ${a}`]);
    expect((await space.pending()).map(({ rkey }) => rkey)).toEqual([b, c]);
  });

  test('a write made while online goes after the waiting ones', async () => {
    const { pds, space } = await offlineSpace('one');
    const waiting = newRecordKey();
    await space.put(collection, waiting, { text: 'waiting' });

    pds.network.online = true;
    const now = newRecordKey();
    expect(await space.put(collection, now, { text: 'now' })).toBe('sent');

    expect(pds.writes).toEqual([`put ${waiting}`, `put ${now}`]);
  });

  test('writes started together go out in order, and the last one wins', async () => {
    const pds = fakePds();
    const space = openSpace(pds.handler, owner, memoryLocalCopy());
    const [a, b] = [newRecordKey(), newRecordKey()];
    await space.put(collection, a, { text: 'a' });
    pds.writes.length = 0;

    await Promise.all([
      space.put(collection, b, { text: 'b' }),
      space.put(collection, a, { text: 'a, edited' }),
      space.delete(collection, a),
    ]);

    expect(pds.writes).toEqual([`put ${b}`, `delete ${a}`]);
    expect(await space.get(collection, a)).toBeUndefined();
  });

  test('a write the PDS refuses stays visible with its reason, is not sent again, and does not block the others', async () => {
    const pds = fakePds();
    // The PDS refuses records with the text "bad".
    const handler: FetchHandler = (pathname, init) =>
      typeof init?.body === 'string' && init.body.includes('"text":"bad"')
        ? Promise.resolve(Response.json({ error: 'InvalidRecord', message: 'Record is not valid' }, { status: 400 }))
        : pds.handler(pathname, init);
    const space = openSpace(handler, owner, memoryLocalCopy());
    const [bad, good] = [newRecordKey(), newRecordKey()];

    expect(await space.put(collection, bad, { text: 'bad' })).toBe('refused');
    expect(await space.put(collection, good, { text: 'good' })).toBe('sent');
    await space.sendWaiting();

    expect(await space.pending()).toEqual([
      { collection, rkey: bad, record: { $type: collection, text: 'bad' }, refused: 'Record is not valid' },
    ]);
    expect(pds.writes).toEqual([`put ${good}`]);
    expect(textsOf((await space.list(collection)).records)).toEqual(['good']);
    // A new write to the same record replaces the refused one.
    expect(await space.put(collection, bad, { text: 'fixed' })).toBe('sent');
    expect(await space.pending()).toEqual([]);
  });

  test('another account on the device never gets the waiting writes', async () => {
    const { pds, copy, space } = await offlineSpace('one');
    await space.put(collection, newRecordKey(), { text: 'private' });

    pds.network.online = true;
    const other = openSpace(pds.handler, 'did:plc:other', copy);
    await other.sendWaiting();

    expect(await other.pending()).toEqual([]);
    expect(pds.writes).toEqual([]);
    expect(await space.pending()).toHaveLength(1);
  });

  test('sign-out (a cleared copy) drops the waiting writes', async () => {
    const { copy, space } = await offlineSpace('one');
    await space.put(collection, newRecordKey(), { text: 'private' });

    await copy.clear();

    expect(await space.pending()).toEqual([]);
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
    pds.network.online = false;
    await space.put(collection, newRecordKey(), { text: 'waiting' });
    await space.delete(collection, rkey);
    pds.network.online = true;
    await space.sendWaiting();

    expect(pds.writes).toHaveLength(3);
    expect(pds.calls.every((call) => call.startsWith('/xrpc/com.atproto.space.'))).toBe(true);
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

// Each failure names its own cause: the Atomes server, the reader's PDS, or the network.
describe('spaceErrorMessage', () => {
  test.each([
    [
      'the Atomes server is down (Phase 1: this read as a PDS failure)',
      new ClientMetadataError(false, 'Could not load', { cause: new TypeError('Failed to fetch') }),
      'Could not reach this Atomes server. Check your connection and try again.',
    ],
    [
      'the Atomes server is set up wrongly',
      new ClientMetadataError(true, 'HTTP 500'),
      'This Atomes server is not set up correctly. Tell its owner.',
    ],
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
