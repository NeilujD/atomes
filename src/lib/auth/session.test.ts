import { describe, expect, test } from 'vitest';
import { memoryLocalCopy } from '../space/local-copy.fake';
import { serverAuthClient } from './server-client';
import {
  askSignInCode,
  codeIn,
  errorMessage,
  gate,
  keepInvite,
  loadSession,
  signIn,
  signInResultMessage,
  signInWithCode,
  signOut,
  type AuthClient,
} from './session';

const reader = { id: 'account-reader', handle: 'reader.test' };

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
  const client = (): AuthClient => serverAuthClient({
      fetch,
      storage,
      submitSignIn: (handle, returnTo) => server.submitted.push({ handle, returnTo }),
      localCopy: memoryLocalCopy(),
    });
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
    ['no-invite', 'You need an Invite to create an account on this Atomes server. Ask its owner for one.'],
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

describe('keepInvite', () => {
  const answering = (status: number) => {
    const sent: { url: string; init?: RequestInit }[] = [];
    const fetch = (url: string, init?: RequestInit) => {
      sent.push({ url, init });
      return Promise.resolve(new Response(null, { status }));
    };
    return { fetch, sent };
  };

  test('an open Invite is kept on the server, and the screen says so', async () => {
    const { fetch, sent } = answering(204);

    expect(await keepInvite(fetch, 'token')).toBe('Invite kept. Sign in to create your account.');
    expect(sent.map(({ url, init }) => [url, init?.method, init?.body])).toEqual([['/api/invite', 'POST', '{"invite":"token"}']]);
  });

  test('a used or expired Invite says so', async () => {
    expect(await keepInvite(answering(410).fetch, 'token')).toBe('This Invite was used or has expired. Ask the owner of this Atomes server for a new one.');
  });

  test('with no network, says the server is out of reach', async () => {
    const fetch = () => Promise.reject(new TypeError('Failed to fetch'));

    expect(await keepInvite(fetch, 'token')).toBe(errorMessage(new TypeError('Failed to fetch')));
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

describe('codeIn', () => {
  test.each([
    ['482913', '482913'],
    ['482 913', '482913'],
    [' 482\n913 ', '482913'],
    ['Your sign-in code for Atomes:\n\n482913\n\nIt works once, for 10 minutes.', '482913'],
    ['482913\n10 minutes', '482913'],
  ])('finds the code in %j', (text, code) => {
    expect(codeIn(text)).toBe(code);
  });

  test.each(['', '48291', '4829134', '482-913', 'no code here'])('finds no code in %j', (text) => {
    expect(codeIn(text)).toBeUndefined();
  });
});

describe('sign-in with a Sign-in Code', () => {
  const answering = (status: number, body?: unknown) => {
    const sent: { url: string; body: unknown }[] = [];
    const fetch = (url: string, init?: RequestInit) => {
      sent.push({ url, body: JSON.parse(init?.body as string) });
      return Promise.resolve(body === undefined ? new Response(null, { status }) : Response.json(body, { status }));
    };
    return { fetch, sent };
  };

  test('asks a code for the trimmed, lower-cased address', async () => {
    const { fetch, sent } = answering(204);

    expect(await askSignInCode(fetch, ' Reader@Example.org ')).toEqual({ email: 'reader@example.org' });
    expect(sent).toEqual([{ url: '/api/sign-in/code', body: { email: 'reader@example.org' } }]);
  });

  test.each([
    ['an empty field', '', 204, 'Type your email address, for example alice@example.org.'],
    ['an address the server refuses', 'reader@example', 400, 'Type your email address, for example alice@example.org.'],
    ['too many asks', 'reader@example.org', 429, 'Too many tries. Wait a while, then try again.'],
  ])('%s: the screen says why, and stays on the address', async (_, input, status, message) => {
    expect(await askSignInCode(answering(status).fetch, input)).toEqual({ message });
  });

  test('a pasted code keeps its digits only', async () => {
    const { fetch, sent } = answering(204);

    expect(await signInWithCode(fetch, 'reader@example.org', ' 123 456\n')).toBeUndefined();
    expect(sent).toEqual([{ url: '/api/sign-in/check', body: { email: 'reader@example.org', code: '123456' } }]);
  });

  test.each([
    ['a short code', '12345', 204, undefined, 'Type the 6 digits of your Sign-in Code.'],
    ['a wrong code', '123456', 400, { error: 'WrongCode' }, 'This code is wrong or has expired. Check it, or ask for a new one.'],
    ['no Invite', '123456', 403, { error: 'NoInvite' }, 'You need an Invite to create an account on this Atomes server. Ask its owner for one.'],
    ['too many tries', '123456', 429, { error: 'TooMany' }, 'Too many tries. Wait a while, then try again.'],
  ])('%s: the screen says why', async (_, code, status, body, message) => {
    expect(await signInWithCode(answering(status, body).fetch, 'reader@example.org', code)).toBe(message);
  });

  test('offline: the screen says the server is out of reach', async () => {
    const offline = () => Promise.reject(new TypeError('Failed to fetch'));

    expect(await signInWithCode(offline, 'reader@example.org', '123456')).toBe(errorMessage(new TypeError('Failed to fetch')));
  });
});
