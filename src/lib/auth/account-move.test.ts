// The device move from the DID key to the Account key (ADR 0016). In the Node
// environment, not happy-dom: the fake instance runs the real server store,
// which needs node:sqlite.
import { describe, expect, test, vi } from 'vitest';
import { fakeInstance } from '../space/instance.fake';
import { openInstanceStore } from '../space/instance-store';
import { memoryLocalCopy } from '../space/local-copy.fake';
import { accountKey } from './gate-boot';
import { serverAuthClient } from './server-client';

describe('the move from the DID key to the Account key (ADR 0016)', () => {
  const did = 'did:plc:reader';
  const id = 'account-reader';
  const collection = 'app.atomes.toBuy';

  // A device of before Accounts: its saved account and its local copy are keyed by the DID.
  function deviceOfBefore() {
    const values = new Map<string, string>([[accountKey, JSON.stringify({ did, handle: 'reader.example' })]]);
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value), removeItem: (key: string) => void values.delete(key) };
    return { storage, values, localCopy: memoryLocalCopy() };
  }
  const online = () => Promise.resolve(Response.json({ id, handle: 'reader.example' }));
  const offline = () => Promise.reject(new TypeError('Failed to fetch'));

  test('a write queued offline under the DID key is sent after the move, once', async () => {
    const { storage, values, localCopy } = deviceOfBefore();
    const server = fakeInstance(id);
    server.network.online = false;
    expect(await openInstanceStore(server.handler, did, localCopy).put(collection, '3l2a', { isbn: '9782723478991' })).toBe('waiting');
    server.network.online = true;

    const account = await serverAuthClient({ fetch: online, storage, submitSignIn: () => {}, localCopy }).init();

    expect(account).toEqual({ id, handle: 'reader.example' });
    expect(JSON.parse(values.get(accountKey)!)).toEqual({ id, handle: 'reader.example' });
    const store = openInstanceStore(server.handler, account!.id, localCopy);
    expect(await store.pending()).toHaveLength(1);
    await store.sendWaiting();
    await store.sendWaiting();
    // Nothing waits under the DID any more.
    await openInstanceStore(server.handler, did, localCopy).sendWaiting();
    expect(server.writes).toEqual(['put 3l2a']);
    expect(await store.pending()).toEqual([]);
  });

  test('a device with the old saved account that starts offline shows its Library, under the DID key', async () => {
    const { storage, values, localCopy } = deviceOfBefore();
    const server = fakeInstance(id);
    const before = openInstanceStore(server.handler, did, localCopy);
    await before.put(collection, '3l2a', { isbn: '9782723478991' });
    await before.list(collection);
    server.network.online = false;

    const account = await serverAuthClient({ fetch: offline, storage, submitSignIn: () => {}, localCopy }).init();

    expect(account).toEqual({ id: did, handle: 'reader.example' });
    expect(await openInstanceStore(server.handler, account!.id, localCopy).list(collection)).toEqual({
      records: [{ rkey: '3l2a', value: { $type: collection, isbn: '9782723478991' } }],
      stale: true,
    });
    // The old shape stays until the server answers with the Account.
    expect(JSON.parse(values.get(accountKey)!)).toEqual({ did, handle: 'reader.example' });
  });

  test('a saved Account is never moved again', async () => {
    const { storage, localCopy } = deviceOfBefore();
    storage.setItem(accountKey, JSON.stringify({ id, handle: 'reader.example' }));
    const move = vi.spyOn(localCopy, 'move');

    await serverAuthClient({ fetch: online, storage, submitSignIn: () => {}, localCopy }).init();

    expect(move).not.toHaveBeenCalled();
  });
});
