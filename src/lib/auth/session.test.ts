import {
  OAuthCallbackError,
  OAuthResolverError,
  OAuthResponseError,
  TokenRefreshError,
} from '@atproto/oauth-client-browser';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { memoryLocalCopy } from '../space/local-copy.fake';
import { ClientMetadataError } from './client-metadata';
import { errorMessage, loadSession, signIn, signOut, type AuthClient } from './session';

const reader = { did: 'did:plc:reader', handle: 'reader.test' };
const accessToken = 'access-token-never-leaves-the-client';
const refreshToken = 'refresh-token-never-leaves-the-client';

// What the real client keeps on the device (IndexedDB): it survives a reload.
interface Device {
  stored?: { did: string; handle: string; accessToken: string; refreshToken: string };
  // Set when the PDS sends the window back to the callback page.
  callback?: 'approved' | 'denied';
  redirectedTo?: string;
}

// A new client on the same device stands for a page load.
function fakeClient(device: Device): AuthClient {
  return {
    init() {
      const outcome = device.callback;
      device.callback = undefined;
      if (outcome === 'denied') {
        return Promise.reject(new OAuthCallbackError(new URLSearchParams({ error: 'access_denied' })));
      }
      if (outcome === 'approved') device.stored = { ...reader, accessToken, refreshToken };
      return Promise.resolve(device.stored && { did: device.stored.did, handle: device.stored.handle });
    },
    signIn(handle) {
      if (handle !== reader.handle) return Promise.reject(new OAuthResolverError(`Failed to resolve identity: ${handle}`));
      device.redirectedTo = `https://pds.test/oauth/authorize?login_hint=${handle}`;
      return Promise.resolve();
    },
    signOut(did) {
      if (device.stored?.did === did) device.stored = undefined;
      return Promise.resolve();
    },
  };
}

describe('session', () => {
  test('signed out, signed in, restored after a reload, signed out', async () => {
    const device: Device = {};

    expect(await loadSession(fakeClient(device))).toEqual({ status: 'signed-out' });

    await signIn(fakeClient(device), ' @reader.test ');
    expect(device.redirectedTo).toContain('login_hint=reader.test');

    device.callback = 'approved';
    expect(await loadSession(fakeClient(device))).toEqual({ status: 'signed-in', account: reader });

    expect(await loadSession(fakeClient(device))).toEqual({ status: 'signed-in', account: reader });

    expect(await signOut(fakeClient(device), reader, memoryLocalCopy())).toEqual({ status: 'signed-out' });
    expect(device.stored).toBeUndefined();
    expect(await loadSession(fakeClient(device))).toEqual({ status: 'signed-out' });
  });

  test('a cancelled sign-in leaves the reader signed out with a clear message', async () => {
    const device: Device = { callback: 'denied' };

    expect(await loadSession(fakeClient(device))).toEqual({ status: 'signed-out', message: 'Sign-in was cancelled.' });
    expect(device.stored).toBeUndefined();
  });

  test('an unknown handle gives a clear message and no redirect', async () => {
    const device: Device = {};

    expect(await signIn(fakeClient(device), 'nobody.test')).toEqual({
      status: 'signed-out',
      message: 'No account found for this handle. Check the spelling.',
    });
    expect(device.redirectedTo).toBeUndefined();
  });

  test('an empty handle asks for one', async () => {
    expect(await signIn(fakeClient({}), '  ')).toEqual({
      status: 'signed-out',
      message: 'Type your handle, for example alice.bsky.social.',
    });
  });

  test('sign-out tells the reader when the PDS could not be reached', async () => {
    const client = { ...fakeClient({}), signOut: () => Promise.reject(new TypeError('Failed to fetch')) };

    expect(await signOut(client, reader, memoryLocalCopy())).toEqual({
      status: 'signed-out',
      message: 'Signed out on this device. Your PDS could not be reached to end the session there.',
    });
  });

  test.each<[string, AuthClient]>([
    ['the PDS ends the session', fakeClient({})],
    ['the PDS cannot be reached', { ...fakeClient({}), signOut: () => Promise.reject(new TypeError('Failed to fetch')) }],
  ])('sign-out clears the local copy of the Space when %s', async (_, client) => {
    const copy = memoryLocalCopy();
    await copy.write('at://did:plc:reader/space/app.atomes.library/self/app.atomes.copy', [
      { rkey: 'a', value: { text: 'private' } },
    ]);

    await signOut(client, reader, copy);

    expect(await copy.read('at://did:plc:reader/space/app.atomes.library/self/app.atomes.copy')).toBeUndefined();
  });
});

describe('tokens', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('are never logged, never sent to the Atomes server and never in the state the page shows', async () => {
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    );
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    const device: Device = {};
    const states = [];

    states.push(await loadSession(fakeClient(device)));
    states.push(await signIn(fakeClient(device), 'reader.test'));
    device.callback = 'approved';
    states.push(await loadSession(fakeClient(device)));
    states.push(await loadSession(fakeClient(device)));
    states.push(await signOut(fakeClient(device), reader, memoryLocalCopy()));
    device.callback = 'denied';
    states.push(await loadSession(fakeClient(device)));

    const seen = JSON.stringify([states, ...logs.map((log) => log.mock.calls), fetch.mock.calls]);
    expect(seen).not.toContain(accessToken);
    expect(seen).not.toContain(refreshToken);
    expect(logs.every((log) => log.mock.calls.length === 0)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('errorMessage', () => {
  const response = (status: number) => new Response(null, { status });

  test.each([
    ['the reader denies access on the PDS page', new OAuthCallbackError(new URLSearchParams({ error: 'access_denied' })), 'Sign-in was cancelled.'],
    ['the reader comes back with the Back button', new Error('User navigated back'), 'Sign-in was cancelled.'],
    [
      'the PDS refuses the scope',
      new OAuthResponseError(response(400), { error: 'invalid_scope', error_description: 'Unknown space type' }),
      'Your PDS refused the sign-in: Unknown space type',
    ],
    ['the handle does not resolve', new OAuthResolverError('Failed to resolve identity: x.test'), 'No account found for this handle. Check the spelling.'],
    [
      'the network is down',
      new OAuthResolverError('Failed to resolve identity: x.test', { cause: new TypeError('Failed to fetch') }),
      'Could not reach your PDS. Check your connection and try again.',
    ],
    [
      'this Atomes server is not set up for sign-in',
      new ClientMetadataError(true, 'HTTP 500'),
      'This Atomes server is not set up for sign-in. Its owner must set PUBLIC_APP_ORIGIN to its https origin.',
    ],
    [
      'this Atomes server cannot be reached',
      new ClientMetadataError(false, 'Unreachable', { cause: new TypeError('Failed to fetch') }),
      'Could not reach this Atomes server. Check your connection and try again.',
    ],
    ['the session expired',new TokenRefreshError('did:plc:reader', 'expired'), 'Your session has ended. Sign in again.'],
    ['anything else', new Error('boom'), 'Sign-in failed. Try again.'],
  ])('%s', (_, error, message) => {
    expect(errorMessage(error)).toBe(message);
  });
});
