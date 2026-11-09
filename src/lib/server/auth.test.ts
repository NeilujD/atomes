import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { callback, isSameOrigin, session, sessionCookie, signIn, signOut, type AuthDeps, type OAuthPort } from './auth';
import { createAuthStore, NotAllowedError, type AuthStore } from './auth-store';
import { secretBox } from './secret-box';

const owner = 'did:plc:owner';
const stranger = 'did:plc:stranger';
const accessToken = 'access-token-only-on-the-server';
const refreshToken = 'refresh-token-only-on-the-server';
const dpopSecret = 'dpop-private-key-part';
const app = 'https://atomes.test';

// Stands for `@atproto/oauth-client-node`: the callback saves the OAuth session
// in the session store before it answers, as the library does, so a store that
// refuses the DID makes the callback fail. The PDS is never called.
function fakeOAuth(store: AuthStore) {
  const revoked: string[] = [];
  const oauth: OAuthPort = {
    authorize: (handle) => Promise.resolve(new URL(`https://pds.test/oauth/authorize?login_hint=${handle}`)),
    async callback(params) {
      const did = params.get('sub')!;
      await store.sessions().set(did, { tokenSet: { access_token: accessToken, refresh_token: refreshToken }, dpopJwk: { d: dpopSecret } });
      return { did };
    },
    handleOf: (did) => Promise.resolve(`${did.split(':').at(-1)}.test`),
    async revoke(did) {
      revoked.push(did);
      await store.sessions().del(did);
    },
  };
  return { oauth, revoked };
}

let dir: string;
let file: string;
let store: AuthStore;
let deps: AuthDeps;
let revoked: string[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atomes-auth-'));
  file = join(dir, 'auth.sqlite');
  store = createAuthStore({ file, box: secretBox(randomBytes(32)), allowedDids: new Set([owner]) });
  const fake = fakeOAuth(store);
  revoked = fake.revoked;
  deps = { oauth: fake.oauth, store, appOrigin: app };
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const back = (did: string) => callback(new Request(`${app}/oauth/callback?code=c&state=s&sub=${encodeURIComponent(did)}`), deps);
const cookieOf = (response: Response) => /atomes_session=([^;]*)/.exec(response.headers.get('set-cookie') ?? '')?.[1];
const withCookie = (path: string, cookie: string | undefined, init: RequestInit = {}) =>
  new Request(`${app}${path}`, { ...init, headers: { cookie: `${sessionCookie}=${cookie ?? ''}`, origin: app } });

describe('sign-in', () => {
  test('the form sends the reader to their PDS page', async () => {
    const response = await signIn(
      new Request(`${app}/oauth/sign-in`, { method: 'POST', body: new URLSearchParams({ handle: ' @owner.test ' }) }),
      deps,
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://pds.test/oauth/authorize?login_hint=owner.test');
  });

  test('an allowed DID gets a browser session with a safe cookie, and nothing more', async () => {
    const response = await back(owner);

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/settings?auth=signed-in');
    const header = response.headers.get('set-cookie')!;
    expect(header).toMatch(/^atomes_session=[A-Za-z0-9_-]{43}; /);
    expect(header.split('; ')).toEqual(expect.arrayContaining(['Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax']));
    // The cookie is the only thing the browser gets: no token in the answer.
    expect(JSON.stringify([...response.headers])).not.toContain(accessToken);

    const who = session(withCookie('/api/session', cookieOf(response)), deps);
    expect(await who.json()).toEqual({ did: owner, handle: 'owner.test' });
  });

  test('a DID that is not on the list gets a clear message, and no session is stored', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const response = await back(stranger);

    expect(response.headers.get('location')).toBe('/settings?auth=not-allowed');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await store.sessions().get(stranger)).toBeUndefined();
    expect(store.hasBrowserSessions(stranger)).toBe(false);
  });

  test('a DID refused before the PDS page goes back with the same message', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    deps.oauth.authorize = () => Promise.reject(new NotAllowedError(stranger));

    const response = await signIn(
      new Request(`${app}/oauth/sign-in`, { method: 'POST', body: new URLSearchParams({ handle: 'stranger.test' }) }),
      deps,
    );

    expect(response.headers.get('location')).toBe('/settings?auth=not-allowed');
  });

  test('a DID taken off the list loses its open browser session', async () => {
    const cookie = cookieOf(await back(owner));
    store.close();
    store = createAuthStore({ file, box: secretBox(randomBytes(32)), allowedDids: new Set() });

    expect(session(withCookie('/api/session', cookie), { store }).status).toBe(401);
  });

  test('tokens and DPoP keys are stored encrypted, and the cookie value is not stored', async () => {
    const cookie = cookieOf(await back(owner))!;

    const onDisk = readFileSync(file).toString('latin1');
    expect(onDisk).toContain(owner);
    for (const secret of [accessToken, refreshToken, dpopSecret, cookie]) expect(onDisk).not.toContain(secret);
    expect(await store.sessions().get(owner)).toMatchObject({ tokenSet: { access_token: accessToken } });
  });
});

describe('sign-out', () => {
  test('removes the browser session and the cookie, and ends the OAuth session', async () => {
    const cookie = cookieOf(await back(owner));

    const response = await signOut(withCookie('/oauth/sign-out', cookie, { method: 'POST' }), deps);

    expect(response.headers.get('set-cookie')).toMatch(/^atomes_session=; .*Max-Age=0/);
    expect(await response.json()).toEqual({ pdsReached: true });
    expect(session(withCookie('/api/session', cookie), deps).status).toBe(401);
    expect(revoked).toEqual([owner]);
    expect(await store.sessions().get(owner)).toBeUndefined();
  });

  test('keeps the OAuth session while another browser of the reader is signed in', async () => {
    const phone = cookieOf(await back(owner));
    const laptop = cookieOf(await back(owner));

    await signOut(withCookie('/oauth/sign-out', phone, { method: 'POST' }), deps);

    expect(revoked).toEqual([]);
    expect(session(withCookie('/api/session', laptop), deps).status).toBe(200);
  });

  test('with no session, still removes the cookie', async () => {
    const response = await signOut(withCookie('/oauth/sign-out', undefined, { method: 'POST' }), deps);

    expect(response.headers.get('set-cookie')).toMatch(/Max-Age=0/);
    expect(revoked).toEqual([]);
  });
});

describe('isSameOrigin', () => {
  test.each([
    [app, true],
    ['https://evil.test', false],
    [null, false],
  ])('Origin %s gives %s', (origin, same) => {
    const request = new Request('http://10.0.0.5:4321/oauth/sign-out', { method: 'POST', headers: origin ? { origin } : {} });
    expect(isSameOrigin(request, app)).toBe(same);
  });

  test('in local development, the origin of the request', () => {
    const request = new Request('http://127.0.0.1:4321/oauth/sign-out', { method: 'POST', headers: { origin: 'http://127.0.0.1:4321' } });
    expect(isSameOrigin(request)).toBe(true);
  });
});
