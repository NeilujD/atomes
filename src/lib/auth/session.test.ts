import { describe, expect, test } from 'vitest';
import { memoryLocalCopy } from '../space/local-copy.fake';
import { serverAuthClient } from './server-client';
import { errorMessage, gate, loadSession, signIn, signInResultMessage, signOut, type AuthClient } from './session';

const reader = { did: 'did:plc:reader', handle: 'reader.test' };

// The Atomes server as the device sees it: one browser session, behind a cookie
// the device cannot read. `online = false` stands for the network off.
function fakeServer() {
  const server = { signedIn: false, online: true, failing: false, signOutCalls: 0, submitted: [] as { handle: string; returnTo: string }[] };
  const fetch = (input: string, init?: RequestInit) => {
    if (!server.online) return Promise.reject(new TypeError('Failed to fetch'));
    if (input === '/api/session') {
      if (server.failing) return Promise.resolve(new Response(null, { status: 502 }));
      return Promise.resolve(server.signedIn ? Response.json(reader) : Response.json({ error: 'SignedOut' }, { status: 401 }));
    }
    if (input === '/oauth/sign-out' && init?.method === 'POST') {
      server.signOutCalls++;
      server.signedIn = false;
      return Promise.resolve(Response.json({ pdsReached: true }));
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  };
  return { server, fetch };
}

// What the device keeps between page loads (localStorage).
function memoryStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

// A new client on the same device stands for a page load.
function setup() {
  const { server, fetch } = fakeServer();
  const storage = memoryStorage();
  const client = (): AuthClient => serverAuthClient({ fetch, storage, submitSignIn: (handle, returnTo) => server.submitted.push({ handle, returnTo }) });
  return { server, storage, client };
}

describe('session', () => {
  test('signed out, sign-in sent to the server, signed in after the callback, signed out', async () => {
    const { server, client } = setup();

    expect(await loadSession(client())).toEqual({ status: 'signed-out' });

    void signIn(client(), ' @reader.test ', '/book?work=isbn%3A9782723488525');
    expect(server.submitted).toEqual([{ handle: 'reader.test', returnTo: '/book?work=isbn%3A9782723488525' }]);

    server.signedIn = true;
    expect(await loadSession(client())).toEqual({ status: 'signed-in', account: reader });

    expect(await signOut(client(), reader, memoryLocalCopy())).toEqual({ status: 'signed-out' });
    expect(server.signOutCalls).toBe(1);
    expect(await loadSession(client())).toEqual({ status: 'signed-out' });
  });

  test('the session still opens offline from the device', async () => {
    const { server, client } = setup();
    server.signedIn = true;
    await loadSession(client());

    server.online = false;

    expect(await loadSession(client())).toEqual({ status: 'signed-in', account: reader });
  });

  test('offline on a device that was never signed in: signed out, and told that signing in needs the network', async () => {
    const { server, client } = setup();
    server.online = false;

    expect(await loadSession(client())).toEqual({
      status: 'signed-out',
      message: 'Signing in needs the network. Connect this device, then try again.',
    });
  });

  test('after sign-out, the device no longer opens the session offline', async () => {
    const { server, storage, client } = setup();
    server.signedIn = true;
    await loadSession(client());

    await signOut(client(), reader, memoryLocalCopy());
    server.online = false;

    expect(storage.items.size).toBe(0);
    expect((await loadSession(client())).status).toBe('signed-out');
  });

  test('a session ended on the server is forgotten on the device', async () => {
    const { server, storage, client } = setup();
    server.signedIn = true;
    await loadSession(client());

    server.signedIn = false;

    expect(await loadSession(client())).toEqual({ status: 'signed-out' });
    expect(storage.items.size).toBe(0);
  });

  test('an empty handle asks for one', async () => {
    const { server, client } = setup();

    expect(await signIn(client(), '  ', '/')).toEqual({ status: 'signed-out', message: 'Type your handle, for example alice.bsky.social.' });
    expect(server.submitted).toEqual([]);
  });

  test('sign-out tells the reader when the server could not be reached, and clears the device anyway', async () => {
    const { server, client } = setup();
    const copy = memoryLocalCopy();
    await copy.write('atomes-instance:did:plc:reader/app.atomes.copy', [{ rkey: 'a', value: { text: 'private' } }]);
    server.online = false;

    expect(await signOut(client(), reader, copy)).toEqual({
      status: 'signed-out',
      message: 'Signed out on this device. The Atomes server could not be reached to end the session there.',
    });
    expect(await copy.read('atomes-instance:did:plc:reader/app.atomes.copy')).toBeUndefined();
  });

  test('when the data on this device cannot be cleared, the session still ends and the reader is told', async () => {
    const { server, client } = setup();
    server.signedIn = true;
    const broken = { clear: () => Promise.reject(new Error('IndexedDB is blocked')) };

    expect(await signOut(client(), reader, broken)).toEqual({
      status: 'signed-out',
      message: 'Signed out, but some of your data could not be removed from this device. Clear this site’s data in the browser.',
    });
    expect(server.signedIn).toBe(false);
  });
});

// Every app screen needs a signed-in reader (ADR 0013, amendment 2026-11-12).
describe('gate', () => {
  test('signed in: the screen stays', async () => {
    const { server, client } = setup();
    server.signedIn = true;

    expect(await gate(client(), '/library')).toBeUndefined();
  });

  test('no session: the sign-in screen, with the screen asked as the return target', async () => {
    const { client } = setup();

    expect(await gate(client(), '/book?work=isbn%3A9782723488525#notes')).toBe('/sign-in?next=%2Fbook%3Fwork%3Disbn%253A9782723488525%23notes');
  });

  test('no session on Home: the sign-in screen with no return target', async () => {
    const { client } = setup();

    expect(await gate(client(), '/')).toBe('/sign-in');
  });

  test('a session ended on the server: the sign-in screen, even with a saved account', async () => {
    const { server, client } = setup();
    server.signedIn = true;
    await loadSession(client());

    server.signedIn = false;

    expect(await gate(client(), '/to-buy')).toBe('/sign-in?next=%2Fto-buy');
  });

  test('network error with a saved account: the screen stays (offline use, ADR 0002)', async () => {
    const { server, client } = setup();
    server.signedIn = true;
    await loadSession(client());

    server.online = false;

    expect(await gate(client(), '/library')).toBeUndefined();
  });

  test('network error with no saved account: the sign-in screen, which says it needs the network', async () => {
    const { server, client } = setup();
    server.online = false;

    expect(await gate(client(), '/library')).toBe('/sign-in?next=%2Flibrary');
    expect(await loadSession(client())).toEqual({
      status: 'signed-out',
      message: 'Signing in needs the network. Connect this device, then try again.',
    });
  });

  test('the server answers with an error: the screen stays and tells it, the reader is not sent away', async () => {
    const { server, client } = setup();
    server.failing = true;

    expect(await gate(client(), '/library')).toBeUndefined();
  });
});

describe('signInResultMessage', () => {
  test.each([
    ['not-allowed', 'This account may not sign in to this Atomes server. Ask its owner to add it.'],
    ['cancelled', 'Sign-in was cancelled.'],
    ['no-account', 'No account found for this handle. Check the spelling.'],
    ['unreachable', 'Could not reach your PDS. Try again later.'],
    ['failed', 'Sign-in failed. Try again.'],
    ['signed-in', undefined],
    ['anything', undefined],
    [null, undefined],
  ])('%s', (result, message) => {
    expect(signInResultMessage(result)).toBe(message);
  });
});

describe('errorMessage', () => {
  test.each([
    ['the server cannot be reached', new TypeError('Failed to fetch'), 'Could not reach this Atomes server. Check your connection and try again.'],
    ['anything else', new Error('HTTP 500 for /api/session'), 'Sign-in failed. Try again.'],
  ])('%s', (_, error, message) => {
    expect(errorMessage(error)).toBe(message);
  });
});
