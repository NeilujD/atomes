import { afterEach, describe, expect, test, vi } from 'vitest';
import { fakeInstance } from './instance.fake';
import { openInstanceStore } from './instance-store';
import type { LocalCopy } from './local-copy';
import { memoryLocalCopy } from './local-copy.fake';
import { fakePds } from './pds.fake';
import {
  newRecordKey,
  openSpace,
  PdsUnavailableError,
  RefusedError,
  SignedOutError,
  SpaceError,
  spaceErrorMessage,
  UnavailableError,
  type FetchHandler,
  type Space,
  type StaleWrite,
} from './space';
import type { FakeStoreServer } from './store-server.fake';

const owner = 'did:plc:owner';
const collection = 'app.atomes.copy';

const textsOf = (records: { value: unknown }[]) => records.map(({ value }) => (value as { text: string }).text);

// The same contract for every store of Library records: the instance store the
// app uses (ADR 0012), and the Space store kept for the move to Spaces.
const stores: {
  name: string;
  fake: (did: string) => FakeStoreServer;
  open: (handler: FetchHandler, did: string, copy: LocalCopy) => Space;
  unavailable: typeof UnavailableError;
}[] = [
  { name: 'the instance store', fake: fakeInstance, open: openInstanceStore, unavailable: UnavailableError },
  { name: 'the Space store', fake: fakePds, open: openSpace, unavailable: PdsUnavailableError },
];

describe.each(stores)('$name', ({ fake, open, unavailable }) => {
  const server = () => fake(owner);

  describe('online', () => {
    test('reading before the first save gives nothing', async () => {
      const store = open(server().handler, owner, memoryLocalCopy());

      expect(await store.list(collection)).toEqual({ records: [], stale: false });
      expect(await store.get(collection, 'missing')).toBeUndefined();
    });

    test('a saved record reads back after a reload', async () => {
      const remote = server();
      const rkey = newRecordKey();

      expect(await open(remote.handler, owner, memoryLocalCopy()).put(collection, rkey, { text: 'hello' })).toBe('sent');

      // A new store on the same server stands for a reload.
      const reloaded = open(remote.handler, owner, memoryLocalCopy());
      const value = { $type: collection, text: 'hello' };
      expect(await reloaded.get(collection, rkey)).toEqual(value);
      expect(await reloaded.list(collection)).toEqual({ records: [{ rkey, value }], stale: false });
    });

    test('list reads every record, newest key first', async () => {
      const remote = server();
      const store = open(remote.handler, owner, memoryLocalCopy());
      for (let i = 0; i < 120; i++) await store.put(collection, newRecordKey(), { text: `${i}` });

      const { records } = await store.list(collection);
      expect(records).toHaveLength(120);
      expect(textsOf(records.slice(0, 2))).toEqual(['119', '118']);
    });

    test('a refusal is a RefusedError with the error name', async () => {
      const handler: FetchHandler = () =>
        Promise.resolve(Response.json({ error: 'InvalidRequest', message: 'Bad request' }, { status: 400 }));

      const error = await open(handler, owner, memoryLocalCopy())
        .list(collection)
        .catch((cause: unknown) => cause);

      expect(error).toBeInstanceOf(RefusedError);
      expect(error).toMatchObject({ error: 'InvalidRequest', message: 'Bad request' });
    });
  });

  // The local copy on the device. A new store on the same copy stands for a reload.
  describe('with the network off', () => {
    test('list gives the records last read, marked stale, after a reload', async () => {
      const remote = server();
      const copy = memoryLocalCopy();
      const store = open(remote.handler, owner, copy);
      await store.put(collection, newRecordKey(), { text: 'one' });
      await store.put(collection, newRecordKey(), { text: 'two' });
      const online = await store.list(collection);

      remote.network.online = false;
      const offline = await open(remote.handler, owner, copy).list(collection);

      expect(online.stale).toBe(false);
      expect(offline).toEqual({ records: online.records, stale: true });
      expect(textsOf(offline.records)).toEqual(['two', 'one']);
    });

    test('a record saved online shows offline with no further list (write-through)', async () => {
      const remote = server();
      const copy = memoryLocalCopy();
      const store = open(remote.handler, owner, copy);
      const first = newRecordKey();
      await store.put(collection, first, { text: 'one' });
      await store.list(collection);
      await store.put(collection, newRecordKey(), { text: 'two' });
      await store.put(collection, first, { text: 'one, edited' });

      // Read the server through another copy, so this copy holds only what write-through put in it.
      const fromServer = await open(remote.handler, owner, memoryLocalCopy()).list(collection);
      remote.network.online = false;
      const offline = await open(remote.handler, owner, copy).list(collection);

      expect(textsOf(offline.records)).toEqual(['two', 'one, edited']);
      expect(offline.records).toEqual(fromServer.records);
    });

    test('a failure with a network failure as its cause also falls back to the copy', async () => {
      const remote = server();
      const copy = memoryLocalCopy();
      await open(remote.handler, owner, copy).put(collection, newRecordKey(), { text: 'one' });
      await open(remote.handler, owner, copy).list(collection);
      // What the OAuth client throws when a token refresh cannot reach the server.
      const refreshFails: FetchHandler = () =>
        Promise.reject(new Error('Failed to fetch', { cause: new TypeError('Failed to fetch') }));

      expect(await open(refreshFails, owner, copy).list(collection)).toMatchObject({ stale: true });
    });

    test('list fails when this device has no copy yet', async () => {
      const remote = server();
      remote.network.online = false;

      await expect(open(remote.handler, owner, memoryLocalCopy()).list(collection)).rejects.toThrow(TypeError);
    });

    test('another account on the device never gets the copy', async () => {
      const remote = server();
      const copy = memoryLocalCopy();
      await open(remote.handler, owner, copy).put(collection, newRecordKey(), { text: 'private' });
      await open(remote.handler, owner, copy).list(collection);

      remote.network.online = false;

      await expect(open(remote.handler, 'did:plc:other', copy).list(collection)).rejects.toThrow(TypeError);
    });

    test('a refusal from the server is never hidden behind the copy', async () => {
      const remote = server();
      const copy = memoryLocalCopy();
      await open(remote.handler, owner, copy).put(collection, newRecordKey(), { text: 'one' });
      await open(remote.handler, owner, copy).list(collection);
      const refused: FetchHandler = () => Promise.resolve(Response.json({ error: 'Forbidden' }, { status: 403 }));

      await expect(open(refused, owner, copy).list(collection)).rejects.toThrow(RefusedError);
    });

    test('a cleared copy (sign-out) shows nothing', async () => {
      const remote = server();
      const copy = memoryLocalCopy();
      await open(remote.handler, owner, copy).put(collection, newRecordKey(), { text: 'private' });
      await open(remote.handler, owner, copy).list(collection);

      await copy.clear();
      remote.network.online = false;

      await expect(open(remote.handler, owner, copy).list(collection)).rejects.toThrow(TypeError);
    });
  });

  test('delete removes the record from the server, the listing and the local copy', async () => {
    const remote = server();
    const copy = memoryLocalCopy();
    const store = open(remote.handler, owner, copy);
    const kept = newRecordKey();
    const gone = newRecordKey();
    await store.put(collection, kept, { text: 'kept' });
    await store.put(collection, gone, { text: 'gone' });
    await store.list(collection);

    expect(await store.delete(collection, gone)).toBe('sent');

    expect(await store.get(collection, gone)).toBeUndefined();
    expect(textsOf((await open(remote.handler, owner, memoryLocalCopy()).list(collection)).records)).toEqual(['kept']);
    remote.network.online = false;
    expect(textsOf((await open(remote.handler, owner, copy).list(collection)).records)).toEqual(['kept']);
  });

  // Writes made with no network wait on the device. A new store on the same copy stands for a reload.
  describe('offline writes', () => {
    // A store whose collection copy is filled, then the network goes off.
    async function offlineStore(...texts: string[]) {
      const remote = server();
      const copy = memoryLocalCopy();
      const store = open(remote.handler, owner, copy);
      const keys: string[] = [];
      for (const text of texts) {
        const rkey = newRecordKey();
        keys.push(rkey);
        await store.put(collection, rkey, { text });
      }
      await store.list(collection);
      remote.writes.length = 0;
      remote.network.online = false;
      return { remote, copy, store, keys };
    }

    test('a put waits, and the local copy shows it at once', async () => {
      const { remote, store } = await offlineStore('one');

      expect(await store.put(collection, newRecordKey(), { text: 'two' })).toBe('waiting');

      expect(await store.list(collection)).toMatchObject({ stale: true });
      expect(textsOf((await store.list(collection)).records)).toEqual(['two', 'one']);
      expect(await store.pending()).toHaveLength(1);
      expect(remote.writes).toEqual([]);
    });

    test('after a reload with the network still off, the list shows the waiting write, marked stale', async () => {
      const { remote, copy, store } = await offlineStore('one');
      await store.put(collection, newRecordKey(), { text: 'two' });

      const reloaded = await open(remote.handler, owner, copy).list(collection);

      expect(reloaded.stale).toBe(true);
      expect(textsOf(reloaded.records)).toEqual(['two', 'one']);
    });

    test('a delete waits, and the local copy drops the record at once', async () => {
      const { remote, store, keys } = await offlineStore('one', 'two');

      expect(await store.delete(collection, keys[0])).toBe('waiting');

      expect(textsOf((await store.list(collection)).records)).toEqual(['two']);
      expect(await store.pending()).toEqual([expect.objectContaining({ collection, rkey: keys[0] })]);
      remote.network.online = true;
      await store.sendWaiting();
      expect(remote.writes).toEqual([`delete ${keys[0]}`]);
      expect(textsOf((await store.list(collection)).records)).toEqual(['two']);
    });

    test('offline then reconnect: the waiting writes survive a reload and go out in the order they were made', async () => {
      const { remote, copy, store, keys } = await offlineStore('one');
      const [a, b] = [newRecordKey(), newRecordKey()];
      await store.put(collection, b, { text: 'b' });
      await store.put(collection, a, { text: 'a' });
      await store.delete(collection, keys[0]);

      const reloaded = open(remote.handler, owner, copy);
      expect((await reloaded.pending()).map(({ rkey }) => rkey)).toEqual([b, a, keys[0]]);
      remote.network.online = true;
      // A list with the network back sends them first.
      const listing = await reloaded.list(collection);

      expect(remote.writes).toEqual([`put ${b}`, `put ${a}`, `delete ${keys[0]}`]);
      expect(listing).toMatchObject({ stale: false });
      expect(textsOf(listing.records)).toEqual(['b', 'a']);
      expect(await reloaded.pending()).toEqual([]);
    });

    test('last write wins: a newer write to the same record replaces the waiting one', async () => {
      const { remote, store, keys } = await offlineStore('one');
      const other = newRecordKey();
      await store.put(collection, keys[0], { text: 'first edit' });
      await store.put(collection, other, { text: 'other' });
      await store.put(collection, keys[0], { text: 'second edit' });

      expect(await store.pending()).toHaveLength(2);
      expect(textsOf((await store.list(collection)).records)).toEqual(['other', 'second edit']);
      remote.network.online = true;
      await store.sendWaiting();

      expect(remote.writes).toEqual([`put ${other}`, `put ${keys[0]}`]);
      expect(await store.get(collection, keys[0])).toMatchObject({ text: 'second edit' });
    });

    test('the network failing again stops the send and keeps the rest, in order', async () => {
      const { remote, copy, store } = await offlineStore('one');
      const [a, b, c] = [newRecordKey(), newRecordKey(), newRecordKey()];
      for (const rkey of [a, b, c]) await store.put(collection, rkey, { text: rkey });
      // The network comes back for one call only.
      remote.network.online = true;
      const once: FetchHandler = (pathname, init) => {
        const answer = remote.handler(pathname, init);
        remote.network.online = false;
        return answer;
      };

      await open(once, owner, copy).sendWaiting();

      expect(remote.writes).toEqual([`put ${a}`]);
      expect((await store.pending()).map(({ rkey }) => rkey)).toEqual([b, c]);
    });

    test('a write made while online goes after the waiting ones', async () => {
      const { remote, store } = await offlineStore('one');
      const waiting = newRecordKey();
      await store.put(collection, waiting, { text: 'waiting' });

      remote.network.online = true;
      const now = newRecordKey();
      expect(await store.put(collection, now, { text: 'now' })).toBe('sent');

      expect(remote.writes).toEqual([`put ${waiting}`, `put ${now}`]);
    });

    test('writes started together go out in order, and the last one wins', async () => {
      const remote = server();
      const store = open(remote.handler, owner, memoryLocalCopy());
      const [a, b] = [newRecordKey(), newRecordKey()];
      await store.put(collection, a, { text: 'a' });
      remote.writes.length = 0;

      await Promise.all([
        store.put(collection, b, { text: 'b' }),
        store.put(collection, a, { text: 'a, edited' }),
        store.delete(collection, a),
      ]);

      expect(remote.writes).toEqual([`put ${b}`, `delete ${a}`]);
      expect(await store.get(collection, a)).toBeUndefined();
    });

    test('a refused write stays visible with its reason, is not sent again, and does not block the others', async () => {
      const remote = server();
      // The server refuses records with the text "bad".
      const handler: FetchHandler = (pathname, init) =>
        typeof init?.body === 'string' && init.body.includes('"text":"bad"')
          ? Promise.resolve(Response.json({ error: 'InvalidRecord', message: 'Record is not valid' }, { status: 400 }))
          : remote.handler(pathname, init);
      const store = open(handler, owner, memoryLocalCopy());
      const [bad, good] = [newRecordKey(), newRecordKey()];

      expect(await store.put(collection, bad, { text: 'bad' })).toBe('refused');
      expect(await store.put(collection, good, { text: 'good' })).toBe('sent');
      await store.sendWaiting();

      expect(await store.pending()).toEqual([
        { collection, rkey: bad, record: { $type: collection, text: 'bad' }, refused: 'Record is not valid' },
      ]);
      expect(remote.writes).toEqual([`put ${good}`]);
      expect(textsOf((await store.list(collection)).records)).toEqual(['good']);
      // A new write to the same record replaces the refused one.
      expect(await store.put(collection, bad, { text: 'fixed' })).toBe('sent');
      expect(await store.pending()).toEqual([]);
    });

    test('another account on the device never gets the waiting writes', async () => {
      const { remote, copy, store } = await offlineStore('one');
      await store.put(collection, newRecordKey(), { text: 'private' });

      remote.network.online = true;
      const other = open(remote.handler, 'did:plc:other', copy);
      await other.sendWaiting();

      expect(await other.pending()).toEqual([]);
      expect(remote.writes).toEqual([]);
      expect(await store.pending()).toHaveLength(1);
    });

    test('sign-out (a cleared copy) drops the waiting writes', async () => {
      const { copy, store } = await offlineStore('one');
      await store.put(collection, newRecordKey(), { text: 'private' });

      await copy.clear();

      expect(await store.pending()).toEqual([]);
    });

    test('sign-out during a send (in another tab) does not bring the waiting writes back', async () => {
      const { remote, copy, store } = await offlineStore('one');
      await store.put(collection, newRecordKey(), { text: 'a' });
      await store.put(collection, newRecordKey(), { text: 'b' });
      remote.network.online = true;
      // The other tab signs out while the server is answering the first write.
      const signOutMidway: FetchHandler = async (pathname, init) => {
        const answer = await remote.handler(pathname, init);
        await copy.clear();
        remote.network.online = false;
        return answer;
      };

      await open(signOutMidway, owner, copy).sendWaiting();

      expect(await store.pending()).toEqual([]);
    });
  });

  // Seen on the hosted alpha PDS (2026-11-05): listRecords answered 500 after a delete.
  describe('the server fails for a while (HTTP 5xx or 429)', () => {
    async function failingStore(status: number) {
      const remote = server();
      const copy = memoryLocalCopy();
      const store = open(remote.handler, owner, copy);
      const [kept, removed] = [newRecordKey(), newRecordKey()];
      await store.put(collection, kept, { text: 'kept' });
      await store.put(collection, removed, { text: 'removed' });
      await store.list(collection);
      remote.writes.length = 0;
      remote.network.failing = status;
      return { remote, copy, store, kept, removed };
    }

    test.each([500, 502, 503, 429])('HTTP %i: a delete waits on this device and goes out when the server works again', async (status) => {
      const { remote, store, removed } = await failingStore(status);

      expect(await store.delete(collection, removed)).toBe('waiting');
      expect(await store.pending()).toEqual([expect.objectContaining({ collection, rkey: removed })]);

      remote.network.failing = undefined;
      await store.sendWaiting();

      expect(remote.writes).toEqual([`delete ${removed}`]);
      expect(await store.pending()).toEqual([]);
    });

    test('a put waits too, and is not marked refused', async () => {
      const { store } = await failingStore(500);

      expect(await store.put(collection, newRecordKey(), { text: 'new' })).toBe('waiting');
      expect((await store.pending()).map((write) => write.refused)).toEqual([undefined]);
    });

    test('list gives the copy on this device with the waiting delete applied, marked stale', async () => {
      const { store, removed } = await failingStore(500);
      await store.delete(collection, removed);

      const listing = await store.list(collection);

      expect(listing.stale).toBe(true);
      expect(textsOf(listing.records)).toEqual(['kept']);
    });

    test('with no copy on this device, list fails with an UnavailableError', async () => {
      const remote = server();
      await open(remote.handler, owner, memoryLocalCopy()).put(collection, newRecordKey(), { text: 'one' });
      remote.network.failing = 500;

      await expect(open(remote.handler, owner, memoryLocalCopy()).list(collection)).rejects.toThrow(unavailable);
    });
  });
});

describe('the instance store', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('when the session has ended, writes wait on this device and go out after the next sign-in', async () => {
    const instance = fakeInstance(owner);
    let signedIn = false;
    const handler: FetchHandler = (pathname, init) =>
      signedIn ? instance.handler(pathname, init) : Promise.resolve(Response.json({ error: 'SignedOut', message: 'Sign in again' }, { status: 401 }));
    const store = openInstanceStore(handler, owner, memoryLocalCopy());
    const rkey = newRecordKey();

    expect(await store.put(collection, rkey, { text: 'waiting' })).toBe('waiting');
    await expect(store.list(collection)).rejects.toThrow(SignedOutError);

    signedIn = true;
    await store.sendWaiting();
    expect(instance.writes).toEqual([`put ${rkey}`]);
  });

  test('calls only the instance Library API: the device makes no Space and no PDS call', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    const instance = fakeInstance(owner);
    const store = openInstanceStore(instance.handler, owner, memoryLocalCopy());

    const rkey = newRecordKey();
    await store.put(collection, rkey, { text: 'private' });
    await store.get(collection, rkey);
    await store.list(collection);
    await store.delete(collection, rkey);

    expect(instance.calls.length).toBeGreaterThan(0);
    expect(instance.calls.every((call) => call.startsWith('/api/library'))).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  // Two devices on one instance: each has its own local copy (ADR 0012).
  describe('two devices stay in step', () => {
    function twoDevices() {
      const instance = fakeInstance(owner);
      const stale: StaleWrite[] = [];
      const laptop = openInstanceStore(instance.handler, owner, memoryLocalCopy());
      const phoneCopy = memoryLocalCopy();
      const phone = openInstanceStore(instance.handler, owner, phoneCopy, (write) => stale.push(write));
      return { instance, laptop, phone, phoneCopy, stale };
    }

    test('a record added on one device shows on the other, which then asks only for the changes', async () => {
      const { instance, laptop, phone } = twoDevices();
      await laptop.put(collection, newRecordKey(), { text: 'first book' });
      await phone.list(collection);

      await laptop.put(collection, newRecordKey(), { text: 'new book' });

      expect(textsOf((await phone.list(collection)).records)).toEqual(['new book', 'first book']);
      expect(instance.calls.filter((call) => call.includes('?since=')).at(-1)).not.toBe('/api/library?since=0');
    });

    test('a delete on one device removes the record from the other device copy', async () => {
      const { instance, laptop, phone, phoneCopy } = twoDevices();
      const [kept, gone] = [newRecordKey(), newRecordKey()];
      await laptop.put(collection, kept, { text: 'kept' });
      await laptop.put(collection, gone, { text: 'gone' });
      expect(textsOf((await phone.list(collection)).records)).toEqual(['gone', 'kept']);

      await laptop.delete(collection, gone);

      expect(textsOf((await phone.list(collection)).records)).toEqual(['kept']);
      instance.network.online = false;
      expect(await openInstanceStore(instance.handler, owner, phoneCopy).list(collection)).toEqual({
        records: [{ rkey: kept, value: { $type: collection, text: 'kept' } }],
        stale: true,
      });
    });

    test('when the instance lists everything (old tombstones purged), the device drops what it has', async () => {
      const { instance, laptop, phoneCopy } = twoDevices();
      const [kept, gone] = [newRecordKey(), newRecordKey()];
      await laptop.put(collection, kept, { text: 'kept' });
      await laptop.put(collection, gone, { text: 'gone' });
      const phone = openInstanceStore(instance.handler, owner, phoneCopy);
      await phone.list(collection);
      await laptop.delete(collection, gone);
      // The tombstone is gone: the instance answers with every record.
      const purged: FetchHandler = (pathname, init) => instance.handler(pathname.replace(/\?since=\d+$/, '?since=0'), init);

      expect(textsOf((await openInstanceStore(purged, owner, phoneCopy).list(collection)).records)).toEqual(['kept']);
    });

    test('a write made on an old copy is refused: the instance record wins, the device is told, and the queue goes on', async () => {
      const { instance, laptop, phone, stale } = twoDevices();
      const [book, other] = [newRecordKey(), newRecordKey()];
      await laptop.put(collection, book, { text: 'first' });
      await phone.list(collection);
      // The phone edits offline, while the laptop edits the same record.
      instance.network.online = false;
      await phone.put(collection, book, { text: 'phone edit' });
      await phone.put(collection, other, { text: 'other' });
      instance.network.online = true;
      await laptop.put(collection, book, { text: 'laptop edit' });

      await phone.sendWaiting();

      expect(stale).toEqual([{ collection, rkey: book, value: { $type: collection, text: 'phone edit' } }]);
      expect(await phone.pending()).toEqual([]);
      expect(instance.writes.at(-1)).toBe(`put ${other}`);
      expect(textsOf((await phone.list(collection)).records)).toEqual(['other', 'laptop edit']);
      // The phone now writes on the laptop's version.
      expect(await phone.put(collection, book, { text: 'phone again' })).toBe('sent');
    });

    test('a stale delete names the record the device last saw, and a stale write made online says refused', async () => {
      const { laptop, phone, stale } = twoDevices();
      const [deleted, edited] = [newRecordKey(), newRecordKey()];
      await laptop.put(collection, deleted, { text: 'to delete' });
      await laptop.put(collection, edited, { text: 'to edit' });
      await phone.list(collection);
      await laptop.put(collection, deleted, { text: 'laptop edit' });
      await laptop.put(collection, edited, { text: 'laptop edit' });

      expect(await phone.delete(collection, deleted)).toBe('refused');
      expect(await phone.put(collection, edited, { text: 'phone edit' })).toBe('refused');

      expect(stale).toEqual([
        { collection, rkey: deleted, value: { $type: collection, text: 'to delete' } },
        { collection, rkey: edited, value: { $type: collection, text: 'phone edit' } },
      ]);
      expect(await phone.pending()).toEqual([]);
    });
  });
});

describe('the Space store', () => {
  test('the first save creates one private Space; later saves reuse it', async () => {
    const pds = fakePds(owner);
    const space = openSpace(pds.handler, owner, memoryLocalCopy());

    await space.put(collection, newRecordKey(), { text: 'one' });
    await space.put(collection, newRecordKey(), { text: 'two' });
    await space.ensure();

    expect([...pds.spaces.entries()]).toEqual([
      [
        `at://${owner}/space/app.atomes.library/self`,
        { spaceType: 'app.atomes.library', policy: { $type: 'com.atproto.personalspace.policy' } },
      ],
    ]);
  });

  test('reading and deleting before the first save create no Space', async () => {
    const pds = fakePds(owner);
    const space = openSpace(pds.handler, owner, memoryLocalCopy());

    expect(await space.list(collection)).toEqual({ records: [], stale: false });
    expect(await space.delete(collection, 'missing')).toBe('sent');
    expect(pds.spaces.size).toBe(0);
  });

  test('a PDS refusal is a SpaceError, and goes only to the Space calls', async () => {
    const pds = fakePds(owner);
    await openSpace(pds.handler, owner, memoryLocalCopy()).put(collection, newRecordKey(), { text: 'one' });
    const refused: FetchHandler = () => Promise.resolve(Response.json({ error: 'InvalidToken', message: 'Bad token scope' }, { status: 401 }));

    await expect(openSpace(refused, owner, memoryLocalCopy()).list(collection)).rejects.toThrow(SpaceError);
    expect(pds.calls.every((call) => call.startsWith('/xrpc/com.atproto.space.'))).toBe(true);
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

// Each failure names its own cause: the session, the Atomes server, the reader's PDS, or the network.
describe('spaceErrorMessage', () => {
  test.each([
    ['the session ended', new SignedOutError('Sign in again'), 'Your session has ended. Sign in again.'],
    ['the Atomes server refuses the call', new RefusedError('InvalidRecord', 'Bad record'), 'The Atomes server refused the request: Bad record'],
    [
      'the Atomes server fails for a while',
      new UnavailableError(500, 'Internal Server Error'),
      'The Atomes server has a problem (Internal Server Error). Try again later.',
    ],
    ['the PDS refuses the call', new SpaceError('InvalidToken', 'Bad token scope'), 'Your PDS refused the request: Bad token scope'],
    [
      'the PDS fails for a while',
      new PdsUnavailableError(500, 'Internal Server Error'),
      'Your PDS has a problem (Internal Server Error). Try again later.',
    ],
    ['the network is down', new TypeError('Failed to fetch'), 'Could not reach this Atomes server. Check your connection and try again.'],
    ['anything else', new Error('boom'), 'Something went wrong with your Library. Try again.'],
  ])('%s', (_, error, message) => {
    expect(spaceErrorMessage(error)).toBe(message);
  });
});
