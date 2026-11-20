import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createAccounts, type AccountId, type Accounts, type Did } from './accounts';
import { callback, inviteCookie, keepInvite, linkAtproto, session, sessionCookie, signIn, signInAs, signOut, type AuthDeps, type OAuthPort } from './auth';
import { createAuthStore, type AuthStore } from './auth-store';
import { inviteLifetimeMs, makeInvite } from './invites';
import { openDatabase } from './migrate';
import { authSteps, librarySteps } from './migrations';
import { createLibraryStore } from './library-store';
import { fakePublicRepo } from './public-repo.fake';
import { publicRepo } from './public-repo';
import { secretBox } from './secret-box';
import { createSharing } from './sharing';

const owner: Did = 'did:plc:owner';
// No Account of these tests is an Admin.
const noRoles = { rolesOf: () => [] };
const stranger: Did = 'did:plc:stranger';
const accessToken = 'access-token-only-on-the-server';
const refreshToken = 'refresh-token-only-on-the-server';
const dpopSecret = 'dpop-private-key-part';
const app = 'https://atomes.test';

// Stands for `@atproto/oauth-client-node`: the callback saves the OAuth session
// in the session store before it answers, as the library does. The PDS is
// never called; a handle names the DID `did:plc:<first label>`. The return
// target makes the round trip as the library's app state does: kept on the
// server under the OAuth `state`, given back by the callback.
function fakeOAuth(store: AuthStore) {
  const revoked: string[] = [];
  const states = new Map<string, string>();
  const oauth: OAuthPort = {
    didOf: (handle) => Promise.resolve(`did:plc:${handle.split('.')[0]}` as Did),
    authorize(handle, state) {
      states.set('s', state);
      return Promise.resolve(new URL(`https://pds.test/oauth/authorize?login_hint=${handle}`));
    },
    async callback(params) {
      const did = params.get('sub')! as Did;
      await store.sessions().set(did, { tokenSet: { access_token: accessToken, refresh_token: refreshToken }, dpopJwk: { d: dpopSecret } });
      return { did, state: states.get(params.get('state')!) };
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
let library: DatabaseSync;
let accounts: Accounts;

const openStore = () => createAuthStore({ db: openDatabase(file, authSteps(accounts)), box: secretBox(randomBytes(32)) });
const accountCount = () => (library.prepare('select count(*) as n from account').get() as { n: number }).n;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atomes-auth-'));
  file = join(dir, 'auth.sqlite');
  library = openDatabase(':memory:', librarySteps);
  accounts = createAccounts(library);
  // The owner has an Account already, as the migration of the allow-list made it.
  accounts.ofDid(owner);
  store = openStore();
  const fake = fakeOAuth(store);
  revoked = fake.revoked;
  deps = { oauth: fake.oauth, store, accounts, appOrigin: app };
});

afterEach(() => {
  store.close();
  accounts.close();
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const invited = (invite: string) => ({ cookie: `${inviteCookie}=${invite}` });
const signInForm = (fields: Record<string, string>, headers: Record<string, string> = {}) =>
  signIn(new Request(`${app}/oauth/sign-in`, { method: 'POST', body: new URLSearchParams(fields), headers }), deps);
const back = (did: string, headers: Record<string, string> = {}) =>
  callback(new Request(`${app}/oauth/callback?code=c&state=s&sub=${encodeURIComponent(did)}`, { headers }), deps);
const keep = (invite: unknown) =>
  keepInvite(new Request(`${app}/api/invite`, { method: 'POST', body: JSON.stringify({ invite }), headers: { origin: app } }), deps);
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

  test('a reader with an Account gets a browser session with a safe cookie, and nothing more', async () => {
    const response = await back(owner);

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/');
    const header = response.headers.get('set-cookie')!;
    expect(header).toMatch(/^atomes_session=[A-Za-z0-9_-]{43}; /);
    expect(header.split('; ')).toEqual(expect.arrayContaining(['Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax']));
    // The cookie is the only thing the browser gets: no token in the answer.
    expect(JSON.stringify([...response.headers])).not.toContain(accessToken);

    const who = session(withCookie('/api/session', cookieOf(response)), { ...deps, roles: noRoles });
    // The Account, never the DID.
    expect(await who.json()).toEqual({ id: accounts.ofDid(owner), handle: 'owner.test', atproto: true });
    expect(accounts.ofDid(owner)).not.toContain('did:');
  });

  test('with no Invite, an unknown AT Protocol Account gets "you need an Invite", and nothing is kept', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const response = await back(stranger);

    expect(response.headers.get('location')).toBe('/sign-in?auth=no-invite');
    expect(response.headers.get('set-cookie')).toBeNull();
    // The OAuth session the PDS gave ends at once.
    expect(revoked).toEqual([stranger]);
    expect(await store.sessions().get(stranger)).toBeUndefined();
    expect(accountCount()).toBe(1);
  });

  test('with no Invite, an unknown AT Protocol Account is refused before the PDS page', async () => {
    const response = await signInForm({ handle: 'stranger.test', next: '/to-buy' });

    expect(response.headers.get('location')).toBe('/sign-in?auth=no-invite&next=%2Fto-buy');
  });

  test('after sign-in, the reader lands on the screen asked first', async () => {
    await signInForm({ handle: 'owner.test', next: '/book?work=isbn%3A9782723488525' });

    expect((await back(owner)).headers.get('location')).toBe('/book?work=isbn%3A9782723488525');
  });

  test('a return target on another site lands on Home', async () => {
    await signInForm({ handle: 'owner.test', next: '//evil.test/library' });

    expect((await back(owner)).headers.get('location')).toBe('/');
  });

  test('an empty handle goes back to the sign-in screen, with its return target', async () => {
    const response = await signInForm({ handle: ' ', next: '/library' });

    expect(response.headers.get('location')).toBe('/sign-in?auth=no-account&next=%2Flibrary');
  });

  test('tokens and DPoP keys are stored encrypted, and the cookie value is not stored', async () => {
    const cookie = cookieOf(await back(owner))!;

    const onDisk = readFileSync(file).toString('latin1');
    expect(onDisk).toContain(owner);
    for (const secret of [accessToken, refreshToken, dpopSecret, cookie]) expect(onDisk).not.toContain(secret);
    expect(await store.sessions().get(owner)).toMatchObject({ tokenSet: { access_token: accessToken } });
  });
});

describe('sign-in as a test reader (development)', () => {
  const signInAsUrl = (query = '') => signInAs(new Request(`${app}/dev/sign-in-as${query}`), { store, accounts });

  test('each test DID gets its own Account with no Invite, the same at each sign-in', () => {
    const second: Did = 'did:plc:second';
    const first = store.browserSession(cookieOf(signInAsUrl(`?did=${encodeURIComponent(owner)}`))!)!.account;
    const other = store.browserSession(cookieOf(signInAsUrl(`?did=${encodeURIComponent(second)}`))!)!.account;

    expect(first).toBe(accounts.ofDid(owner));
    expect(other).not.toBe(first);
    expect(store.browserSession(cookieOf(signInAsUrl(`?did=${encodeURIComponent(second)}`))!)!.account).toBe(other);
  });

  test('opens a browser session for the test reader and sends it to the Library', () => {
    const response = signInAsUrl();

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/library');
    expect(response.headers.get('set-cookie')).toMatch(/^atomes_session=[^;]+; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=\d+$/);
    expect(store.browserSession(cookieOf(response)!)).toEqual({ account: accounts.ofDid('did:plc:testreader'), handle: 'test.reader' });
  });

  test('takes the DID and the handle from the query', () => {
    const response = signInAsUrl(`?did=${encodeURIComponent(owner)}&handle=alice.test`);

    expect(store.browserSession(cookieOf(response)!)).toEqual({ account: accounts.ofDid(owner), handle: 'alice.test' });
  });

  test('refuses a value that is not a DID, and writes nothing', () => {
    const response = signInAsUrl('?did=alice.test');

    expect(response.status).toBe(400);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(accountCount()).toBe(1);
  });
});

describe('Invites', () => {
  const now = Date.now();
  const friend: Did = 'did:plc:friend';
  const later: Did = 'did:plc:later';

  test('an Invite makes one Account; a second use is refused', async () => {
    const { token } = makeInvite(library);
    expect((await keep(token)).status).toBe(204);

    const first = await back(friend, invited(token));
    expect(first.headers.get('location')).toBe('/');
    const cookies = first.headers.getSetCookie();
    expect(session(withCookie('/api/session', cookieOf(first)), { ...deps, roles: noRoles }).status).toBe(200);
    // The Invite is used up: the browser forgets it.
    expect(cookies).toContainEqual(expect.stringMatching(/^atomes_invite=; .*Max-Age=0/));
    expect(accountCount()).toBe(2);

    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await keep(token)).status).toBe(410);
    expect((await signInForm({ handle: 'later.test' }, invited(token))).headers.get('location')).toBe('/sign-in?auth=no-invite');
    expect((await back(later, invited(token))).headers.get('location')).toBe('/sign-in?auth=no-invite');
    expect(accountCount()).toBe(2);
    // The reader of the Invite signs in again with no Invite.
    expect((await back(friend)).headers.get('location')).toBe('/');
  });

  test('two sign-ins at once with one Invite make one Account', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { token } = makeInvite(library);

    const answers = await Promise.all([back(friend, invited(token)), back(later, invited(token))]);

    expect(answers.map((answer) => answer.headers.get('location')).sort()).toEqual(['/', '/sign-in?auth=no-invite']);
    expect(accountCount()).toBe(2);
  });

  test('an expired Invite is refused', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { token } = makeInvite(library, now - inviteLifetimeMs - 1);

    expect((await keep(token)).status).toBe(410);
    expect((await signInForm({ handle: 'friend.test' }, invited(token))).headers.get('location')).toBe('/sign-in?auth=no-invite');
    expect((await back(friend, invited(token))).headers.get('location')).toBe('/sign-in?auth=no-invite');
    expect(accountCount()).toBe(1);
  });

  test('works for 14 days', async () => {
    const { token, expiresAt } = makeInvite(library, now - inviteLifetimeMs + 60_000);

    expect(expiresAt - (now - inviteLifetimeMs + 60_000)).toBe(14 * 24 * 3600 * 1000);
    expect((await signInForm({ handle: 'friend.test' }, invited(token))).headers.get('location')).toMatch(/^https:\/\/pds\.test\//);
  });

  test('opening an Invite keeps it in a cookie that no script reads, sent only to the sign-in', async () => {
    const { token } = makeInvite(library);

    const header = (await keep(token)).headers.get('set-cookie')!;

    expect(header.split('; ')).toEqual(
      expect.arrayContaining([`atomes_invite=${token}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=3600']),
    );
  });

  test('refuses an Invite that is not a string, and keeps nothing', async () => {
    const response = await keep({ token: 'x' });

    expect(response.status).toBe(410);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  test('the Accounts made by the migration of the allow-list sign in with no Invite', async () => {
    const before: Did = 'did:plc:before';
    library.exec(`insert into account values ('acc-before', '2026-11-16T10:00:00.000Z');
      insert into identity (account, kind, value) values ('acc-before', 'did', '${before}');`);

    expect((await signInForm({ handle: 'before.test' })).headers.get('location')).toMatch(/^https:\/\/pds\.test\//);
    const response = await back(before);
    expect(store.browserSession(cookieOf(response)!)?.account).toBe('acc-before');
  });

  test('the Invite token is in no log line, no address and no stored row', async () => {
    const lines: unknown[] = [];
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void lines.push(...args));
    }
    const libraryFile = join(dir, 'library.sqlite');
    const onDisk = openDatabase(libraryFile, librarySteps);
    const { token } = makeInvite(onDisk);
    onDisk.close();
    const used = makeInvite(library).token;

    const answers = [
      await keep(used),
      await signInForm({ handle: 'friend.test' }, invited(used)),
      await back(friend, invited(used)),
      await keep(used),
      await signInForm({ handle: 'later.test' }, invited(used)),
      await back(later, invited(used)),
    ];

    expect(lines.length).toBeGreaterThan(0);
    expect(JSON.stringify(lines.map(String))).not.toContain(used);
    for (const answer of answers) expect(answer.headers.get('location') ?? '').not.toContain(used);
    expect(readFileSync(libraryFile).toString('latin1')).not.toContain(token);
  });
});

describe('sign-out', () => {
  test('removes the browser session and the cookie, and ends the OAuth session', async () => {
    const cookie = cookieOf(await back(owner));

    const response = await signOut(withCookie('/oauth/sign-out', cookie, { method: 'POST' }), deps);

    expect(response.headers.get('set-cookie')).toMatch(/^atomes_session=; .*Max-Age=0/);
    expect(await response.json()).toEqual({ pdsReached: true });
    expect(session(withCookie('/api/session', cookie), { ...deps, roles: noRoles }).status).toBe(401);
    expect(revoked).toEqual([owner]);
    expect(await store.sessions().get(owner)).toBeUndefined();
  });

  test('keeps the OAuth session while another browser of the reader is signed in', async () => {
    const phone = cookieOf(await back(owner));
    const laptop = cookieOf(await back(owner));

    await signOut(withCookie('/oauth/sign-out', phone, { method: 'POST' }), deps);

    expect(revoked).toEqual([]);
    expect(session(withCookie('/api/session', laptop), { ...deps, roles: noRoles }).status).toBe(200);
  });

  test('with no session, still removes the cookie', async () => {
    const response = await signOut(withCookie('/oauth/sign-out', undefined, { method: 'POST' }), deps);

    expect(response.headers.get('set-cookie')).toMatch(/Max-Age=0/);
    expect(revoked).toEqual([]);
  });
});
describe('after a sign-in', () => {
  test('tells the Account that signed in, so what waited for the PDS is sent', async () => {
    const signedIn: string[] = [];
    deps = { ...deps, onSignedIn: (account) => void signedIn.push(account) };

    expect((await back(owner)).status).toBe(303);
    expect(signedIn).toEqual([accounts.ofDid(owner)]);
  });

  test('a failure after the sign-in never fails the sign-in', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    deps = { ...deps, onSignedIn: () => Promise.reject(new Error('PDS down')) };

    const response = await back(owner);

    expect(response.status).toBe(303);
    expect(cookieOf(response)).toBeTruthy();
  });

  test('a failed sign-in tells no one', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const signedIn: string[] = [];
    deps = { ...deps, onSignedIn: (account) => void signedIn.push(account) };

    await back(stranger);

    expect(signedIn).toEqual([]);
  });
});

describe('link an AT Protocol Account from Settings', () => {
  const reader: Did = 'did:plc:reader';
  const address = 'reader@example.org';
  let account: AccountId;
  let browser: string;

  beforeEach(() => {
    // An Account made with an email address, signed in on this browser.
    account = accounts.signInEmail(address, makeInvite(library).token);
    browser = store.openBrowserSession({ account, handle: '' }).cookie;
  });

  const link = (handle: string, cookie = browser) =>
    linkAtproto(
      new Request(`${app}/oauth/link`, { method: 'POST', body: new URLSearchParams({ handle }), headers: { cookie: `${sessionCookie}=${cookie}`, origin: app } }),
      deps,
    );
  const finish = (did: string, cookie = browser) => back(did, { cookie: `${sessionCookie}=${cookie}` });
  const settingsResult = (response: Response) => new URL(response.headers.get('location')!, app).searchParams.get('link');
  const sessionOf = async (cookie = browser) =>
    (await session(withCookie('/api/session', cookie), { ...deps, roles: noRoles }).json()) as { id: string; handle?: string; email?: string; atproto: boolean };

  test('an email Account links an AT Protocol Account, then turns a category Shared (fake PDS)', async () => {
    const started = await link('reader.test');
    expect(started.status).toBe(303);
    expect(started.headers.get('location')).toMatch(/^https:\/\/pds\.test\//);

    const done = await finish(reader);

    expect(done.status).toBe(303);
    expect(settingsResult(done)).toBe('linked');
    expect(new URL(done.headers.get('location')!, app).pathname).toBe('/settings');
    // The same browser session, now with the handle; no new session.
    expect(cookieOf(done)).toBeUndefined();
    expect(accounts.identitiesOf(account)).toEqual({ did: reader, email: address });
    expect(await sessionOf()).toEqual({ id: account, handle: 'reader.test', email: address, atproto: true });
    // Signing in with the AT Protocol Account now opens the same Account.
    expect(accounts.signIn(reader, undefined)).toBe(account);

    const libraryStore = createLibraryStore(openDatabase(':memory:', librarySteps));
    libraryStore.put(account, 'app.atomes.readingStatus', 'wd:Q1', {
      $type: 'app.atomes.readingStatus',
      work: 'wd:Q1',
      isbn: '9782723478991',
      status: 'read',
      updatedAt: '2026-11-16T10:00:00.000Z',
    });
    const pds = fakePublicRepo(reader);
    const sharing = createSharing({
      db: openDatabase(':memory:', librarySteps),
      library: libraryStore,
      access: { repoOf: (did) => Promise.resolve(publicRepo(pds.handler, did)) },
      didOf: (owner) => accounts.identitiesOf(owner).did,
    });
    expect((await sharing.state(account)).atproto).toBe(true);
    const state = await sharing.setShared(account, 'readingStatuses', true);
    expect(state.shared.readingStatuses).toBe(true);
    expect([...pds.records.keys()]).toEqual(['app.atomes.readingStatus/wd:Q1']);
    sharing.close();
    libraryStore.close();
  });

  test('an empty handle asks again for the AT Protocol Account already linked (permission to share)', async () => {
    accounts.link(account, 'did', reader);

    const started = await link('');

    expect(started.headers.get('location')).toContain('login_hint=did:plc:reader');
    expect(settingsResult(await finish(reader))).toBe('linked');
  });

  test('signed out: back to the sign-in screen, and no PDS page', async () => {
    const started = await link('reader.test', 'no-such-session');

    expect(started.status).toBe(303);
    expect(started.headers.get('location')).toMatch(/^\/sign-in/);
  });

  test('an Account with an AT Protocol Account cannot link a second one', async () => {
    accounts.link(account, 'did', reader);

    expect(settingsResult(await link('second.test'))).toBe('has-one');
    expect(accounts.identitiesOf(account).did).toBe(reader);
  });

  test('security: an AT Protocol Account of Account A cannot be linked to Account B, nothing is merged, and A keeps its OAuth session', async () => {
    // The owner's DID belongs to another Account (beforeEach).
    expect(settingsResult(await link('owner.test'))).toBe('taken');

    // Typed another handle, but signed in as the owner at the PDS.
    await link('reader.test');
    const done = await finish(owner);

    expect(settingsResult(done)).toBe('taken');
    expect(accounts.identitiesOf(account)).toEqual({ email: address });
    expect(accounts.identitiesOf(accounts.ofDid(owner))).toEqual({ did: owner });
    expect(revoked).toEqual([]);
  });

  test('security: an OAuth link started in one session cannot be finished in another', async () => {
    const other = accounts.signInEmail('other@example.org', makeInvite(library).token);
    const otherBrowser = store.openBrowserSession({ account: other, handle: '' }).cookie;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await link('reader.test');
    // The PDS page of this link, opened in another browser session.
    const done = await finish(reader, otherBrowser);

    expect(settingsResult(done)).toBe('other-session');
    expect(accounts.identitiesOf(account)).toEqual({ email: address });
    expect(accounts.identitiesOf(other)).toEqual({ email: 'other@example.org' });
    // The OAuth session it made belongs to no Account: it ends.
    expect(revoked).toEqual([reader]);

    // Finished with no session at all: the same.
    await link('reader.test');
    expect(settingsResult(await back(reader))).toBe('other-session');
  });

  test('a sign-in callback never links: it signs in to the Account of the DID', async () => {
    const signedIn = await back(owner, { cookie: `${sessionCookie}=${browser}` });

    expect(new URL(signedIn.headers.get('location')!, app).pathname).toBe('/');
    expect(accounts.identitiesOf(account)).toEqual({ email: address });
  });
});
