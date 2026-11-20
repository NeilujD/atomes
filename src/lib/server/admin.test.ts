// The admin request handler (ADR 0020, spec M13 "Testing Decisions" 1): the
// real stores over temporary SQLite files, requests as
// src/pages/api/admin/[...path].ts hands them over.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createCatalog, type Catalog } from '../catalog/catalog';
import { createAccounts, type Accounts, type Did } from './accounts';
import type { AccountRow, Totals } from './admin-accounts';
import { makeInvite } from './invites';
import { createLibraryStore, type LibraryStore } from './library-store';
import { adminOf, handleAdminRequest } from './admin';
import { session, sessionCookie, signInAs } from './auth';
import { createAuthStore, type AuthStore } from './auth-store';
import { openDatabase } from './migrate';
import { authSteps, librarySteps } from './migrations';
import { createRoles, type Roles } from './roles';
import { accountReference } from './account-reference';
import { createAdminStore } from './admin-store';
import { secretBox } from './secret-box';

const app = 'https://atomes.test';
const alice: Did = 'did:plc:alice';
const bob: Did = 'did:plc:bob';

let dir: string;
let db: DatabaseSync;
let accounts: Accounts;
let auth: AuthStore;
let roles: Roles;
let library: LibraryStore;
let catalog: Catalog;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atomes-admin-'));
  const file = join(dir, 'library.sqlite');
  db = openDatabase(file, librarySteps);
  accounts = createAccounts(openDatabase(file, librarySteps));
  // As the instance wires it: reading a session keeps the last active day.
  auth = createAuthStore({
    db: openDatabase(join(dir, 'auth.sqlite'), authSteps(accounts)),
    box: secretBox(randomBytes(32)),
    seen: (account) => accounts.seen(account),
  });
  roles = createRoles(db);
  library = createLibraryStore(openDatabase(file, librarySteps));
  catalog = createCatalog({ file: join(dir, 'catalog.sqlite'), fetch: () => Promise.reject(new TypeError('offline')), host: 'catalog.test', accounts });
});

afterEach(() => {
  catalog.close();
  library.close();
  auth.close();
  accounts.close();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

// A browser session of the Account of `did`; gives its cookie value.
function signedIn(did: Did): string {
  const response = signInAs(new Request(`${app}/dev/sign-in-as?did=${encodeURIComponent(did)}`), { store: auth, accounts });
  return /atomes_session=([^;]*)/.exec(response.headers.get('set-cookie')!)![1];
}

function asAdmin(did: Did): string {
  const cookie = signedIn(did);
  roles.grant(accounts.ofDid(did), null);
  return cookie;
}

const deps = () => ({ store: auth, roles, accounts, admin: createAdminStore(db), catalog });

function request(cookie: string | undefined, method: string, path: string, body?: unknown): Request {
  const headers: Record<string, string> = { origin: app };
  if (cookie) headers.cookie = `${sessionCookie}=${cookie}`;
  return new Request(`${app}${path}`, { method, headers, body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body) });
}

const call = (cookie: string | undefined, method: string, path: string, body?: unknown) => handleAdminRequest(request(cookie, method, path, body), deps());

describe('the gate', () => {
  const paths = [
    ['GET', '/api/admin/accounts'],
    ['POST', '/api/admin/invites'],
    ['POST', '/api/admin/roles/grant'],
    ['GET', '/api/admin/log'],
  ] as const;

  test('a visitor with no session gets a 404 at every admin route, with no redirect', async () => {
    for (const [method, path] of paths) {
      const response = await call(undefined, method, path, {});
      expect(response.status).toBe(404);
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
  });

  test('a reader gets the same 404 as an unknown path', async () => {
    const reader = signedIn(bob);
    asAdmin(alice);
    const unknown = await (await call(asAdmin(alice), 'GET', '/api/admin/nothing-here')).text();

    for (const [method, path] of paths) {
      const response = await call(reader, method, path, {});
      expect(response.status).toBe(404);
      expect(await response.text()).toBe(unknown);
    }
  });

  test('an Admin passes the gate; a revoke works on the next request of the open session', () => {
    const cookie = asAdmin(alice);
    expect(adminOf(request(cookie, 'GET', '/admin'), deps())).toEqual({ account: accounts.ofDid(alice) });

    roles.revoke(accounts.ofDid(alice), null);

    expect(adminOf(request(cookie, 'GET', '/admin'), deps())).toBeUndefined();
  });
});

describe('the session answer', () => {
  const sessionOf = async (cookie: string) =>
    (await session(request(cookie, 'GET', '/api/session'), { store: auth, accounts, roles }).json()) as { admin?: boolean };

  test('has the admin flag for an Admin only', async () => {
    const admin = asAdmin(alice);
    const reader = signedIn(bob);

    expect((await sessionOf(admin)).admin).toBe(true);
    expect((await sessionOf(reader)).admin).toBeUndefined();
  });
});

// An Account with an email address, signed in; gives its cookie value.
function signedInEmail(address: string): string {
  return auth.openBrowserSession({ account: accounts.ofEmail(address), handle: '' }).cookie;
}

type Body = Record<string, unknown>;
const json = async (response: Response) => (await response.json()) as Body;
const logLines = () => db.prepare('select admin, action, target, detail from admin_action order by id').all() as Body[];
const everyValue = () => JSON.stringify(db.prepare('select * from admin_action').all());

describe('the Admins part', () => {
  test('lists each Admin by email address, else by handle, with the day of the grant and who granted it', async () => {
    const cookie = asAdmin(alice);
    signedInEmail('carol@example.org');
    await call(cookie, 'POST', '/api/admin/roles/grant', { email: 'carol@example.org' });

    const { admins } = (await json(await call(cookie, 'GET', '/api/admin/admins'))) as { admins: Body[] };

    expect(admins).toEqual([
      { account: accounts.ofDid(alice), name: 'test.reader', grantedAt: expect.any(Number) as number, grantedBy: null, you: true },
      { account: accounts.ofEmail('carol@example.org'), name: 'carol@example.org', grantedAt: expect.any(Number) as number, grantedBy: 'test.reader', you: false },
    ]);
  });

  test('a grant by email address, typed in any case, gives the role; the log line names the Account, never the address', async () => {
    const cookie = asAdmin(alice);
    const carol = accounts.ofEmail('carol@example.org');

    const response = await call(cookie, 'POST', '/api/admin/roles/grant', { email: '  Carol@Example.ORG ' });

    expect(response.status).toBe(200);
    expect(roles.rolesOf(carol)).toEqual(['admin']);
    expect(logLines().at(-1)).toEqual({ admin: accounts.ofDid(alice), action: 'role.grant', target: carol, detail: null });
    expect(everyValue()).not.toContain('carol@');
  });

  test('a grant for an address with no Account answers NoAccount and logs a search with no target and no address', async () => {
    const cookie = asAdmin(alice);

    const response = await call(cookie, 'POST', '/api/admin/roles/grant', { email: 'nobody@example.org' });

    expect(response.status).toBe(422);
    expect(await json(response)).toEqual({ error: 'NoAccount' });
    expect(logLines().at(-1)).toEqual({ admin: accounts.ofDid(alice), action: 'identity.find', target: null, detail: null });
    expect(everyValue()).not.toContain('nobody');
  });

  test('a text that is not an address is refused, and nothing is logged', async () => {
    const cookie = asAdmin(alice);
    const before = logLines().length;

    expect((await call(cookie, 'POST', '/api/admin/roles/grant', { email: 'not an address' })).status).toBe(400);
    expect(logLines()).toHaveLength(before);
  });

  test('an Admin revokes the role of another Admin, with a log line', async () => {
    const cookie = asAdmin(alice);
    asAdmin(bob);
    const target = accounts.ofDid(bob);

    const response = await call(cookie, 'POST', '/api/admin/roles/revoke', { account: target });

    expect(response.status).toBe(200);
    expect(roles.rolesOf(target)).toEqual([]);
    expect(logLines().at(-1)).toEqual({ admin: accounts.ofDid(alice), action: 'role.revoke', target, detail: null });
  });

  test('the revoke of the own role is refused on the server', async () => {
    const cookie = asAdmin(alice);

    const response = await call(cookie, 'POST', '/api/admin/roles/revoke', { account: accounts.ofDid(alice) });

    expect(response.status).toBe(403);
    expect(roles.rolesOf(accounts.ofDid(alice))).toEqual(['admin']);
  });

  test('the revoke of an Account that is not an Admin changes nothing', async () => {
    const cookie = asAdmin(alice);
    signedIn(bob);
    const before = logLines().length;

    expect((await call(cookie, 'POST', '/api/admin/roles/revoke', { account: accounts.ofDid(bob) })).status).toBe(409);
    expect(logLines()).toHaveLength(before);
  });
});

describe('the Admin Log', () => {
  test('lists the lines newest first: the Admin by name, the script as null, the target by Account Reference', async () => {
    const cookie = asAdmin(alice);
    signedIn(bob);
    const target = accounts.ofDid(bob);
    roles.grant(target, accounts.ofDid(alice));

    const { lines } = (await json(await call(cookie, 'GET', '/api/admin/log'))) as { lines: Body[] };

    expect(lines.map(({ admin, action, target }) => ({ admin, action, target }))).toEqual([
      { admin: 'test.reader', action: 'role.grant', target: accountReference(target) },
      { admin: null, action: 'role.grant', target: accountReference(accounts.ofDid(alice)) },
    ]);
  });

  test('a deleted Account still shows its Account Reference', async () => {
    const cookie = asAdmin(alice);
    const carol = accounts.ofEmail('carol@example.org');
    roles.grant(carol, accounts.ofDid(alice));
    roles.revoke(carol, accounts.ofDid(alice));
    accounts.forget(carol);

    const { lines } = (await json(await call(cookie, 'GET', '/api/admin/log'))) as { lines: Body[] };

    expect(lines[0]).toMatchObject({ action: 'role.revoke', target: accountReference(carol) });
  });

  test('a write removes the lines older than 12 months', () => {
    const admin = createAdminStore(db);
    const now = Date.UTC(2026, 10, 20, 12);
    admin.write({ admin: null, action: 'invite.make', target: null, detail: 'old' }, Date.UTC(2025, 10, 20, 11));
    admin.write({ admin: null, action: 'invite.make', target: null, detail: 'kept' }, Date.UTC(2025, 10, 20, 13));

    admin.write({ admin: null, action: 'invite.make', target: null, detail: 'new' }, now);

    expect(admin.log().map(({ detail }) => detail)).toEqual(['new', 'kept']);
  });
});

describe('the Accounts part', () => {
  const view = async (cookie: string, query = '') =>
    (await json(await call(cookie, 'GET', `/api/admin/accounts${query}`))) as unknown as { totals: Totals; accounts: AccountRow[] };
  const today = new Date().toISOString().slice(0, 10);
  // A Series Correction of the Account, as the Catalog keeps it.
  function correct(account: string, isbn: string) {
    const file = new DatabaseSync(join(dir, 'catalog.sqlite'));
    file.prepare('insert into series_correction (isbn, anchor, account, created_at) values (?, ?, ?, ?)').run(isbn, '9782723478991', account, new Date().toISOString());
    file.close();
  }

  test('one row for each Account: how it started, its sign-in ways, its counts, and the totals of the instance', async () => {
    const cookie = asAdmin(alice);
    const admin = accounts.ofDid(alice);
    // Bob makes a reader Invite; Carol signs up with it by email, then links an AT Protocol Account.
    const bobAccount = accounts.ofDid(bob);
    const carol = accounts.signInEmail('carol@example.org', accounts.makeInvite(bobAccount)!.token);
    accounts.link(carol, 'did', 'did:plc:carol');
    auth.openBrowserSession({ account: carol, handle: 'carol.test' });
    auth.openBrowserSession({ account: carol, handle: 'carol.test' });
    // Dave signs up by email with an Invite of the script.
    const dave = accounts.signInEmail('dave@example.org', makeInvite(db).token);
    library.put(carol, 'app.atomes.copy', 'one', { $type: 'app.atomes.copy', title: 'A secret title' });
    library.put(carol, 'app.atomes.copy', 'two', { $type: 'app.atomes.copy' });
    library.put(carol, 'app.atomes.copy', 'gone', { $type: 'app.atomes.copy' });
    library.delete(carol, 'app.atomes.copy', 'gone');
    correct(carol, '9782723488525');
    makeInvite(db);

    const { totals, accounts: rows } = await view(cookie);

    const row = (account: string) => rows.find((each) => each.account === account)!;
    expect(rows).toHaveLength(4);
    expect(row(carol)).toEqual({
      account: carol,
      reference: accountReference(carol),
      flags: [],
      signedUpAt: expect.any(Number) as number,
      lastActiveDay: null,
      start: { kind: 'reader-invite', by: accountReference(bobAccount) },
      signIn: 'both',
      records: 2,
      changed7d: 3,
      invitesMade: 0,
      invitesUsed: 0,
      corrections: 1,
      sessions: 2,
    });
    expect(row(bobAccount)).toMatchObject({ start: { kind: 'script' }, signIn: 'atproto', invitesMade: 1, invitesUsed: 1, records: 0, sessions: 0 });
    expect(row(dave)).toMatchObject({ start: { kind: 'script' }, signIn: 'email' });
    // The Admin's own request is its activity of today.
    expect(row(admin)).toMatchObject({ lastActiveDay: today, sessions: 1 });
    expect(totals).toEqual({
      accounts: { total: 4, new7d: 4, new30d: 4, active7d: 1, active30d: 1 },
      invites: { open: 1, used: 2, expired: 0 },
      records: 2,
    });
  });

  test('the answer holds no email address, no handle, no DID and nothing a Library holds', async () => {
    const cookie = asAdmin(alice);
    const carol = accounts.signInEmail('carol@example.org', makeInvite(db).token);
    accounts.link(carol, 'did', 'did:plc:carol');
    auth.openBrowserSession({ account: carol, handle: 'carol.test' });
    library.put(carol, 'app.atomes.copy', 'one', { $type: 'app.atomes.copy', title: 'A secret title' });

    const text = await (await call(cookie, 'GET', '/api/admin/accounts')).text();

    for (const secret of ['carol@', 'example.org', 'carol.test', 'test.reader', 'did:', 'secret title']) expect(text).not.toContain(secret);
  });

  test('flagged Accounts come first, and "flagged only" leaves the others out', async () => {
    const cookie = asAdmin(alice);
    const shared = accounts.ofDid(bob);
    for (let i = 0; i < 11; i++) auth.openBrowserSession({ account: shared, handle: '' });

    const all = await view(cookie);
    const flagged = await view(cookie, '?flagged=1');

    expect(all.accounts.map(({ account, flags }) => ({ account, flags }))).toEqual([
      { account: shared, flags: ['many-sessions'] },
      { account: accounts.ofDid(alice), flags: [] },
    ]);
    expect(flagged.accounts.map(({ account }) => account)).toEqual([shared]);
    expect(flagged.totals).toEqual(all.totals);
  });

  test('the last active day is written once a day, when the stored day is older', () => {
    const account = accounts.ofDid(bob);
    const stored = () => (db.prepare('select last_active_day as day from account where id = ?').get(account) as { day: string | null }).day;
    expect(stored()).toBeNull();

    accounts.seen(account, Date.UTC(2026, 10, 20, 9));
    expect(stored()).toBe('2026-11-20');

    accounts.seen(account, Date.UTC(2026, 10, 20, 23, 59));
    accounts.seen(account, Date.UTC(2026, 10, 19, 12));
    expect(stored()).toBe('2026-11-20');

    accounts.seen(account, Date.UTC(2026, 10, 21, 0, 1));
    expect(stored()).toBe('2026-11-21');
    // Nothing else of the request is kept: the Account row holds its ID, its sign-up and this day.
    expect(Object.keys(db.prepare('select * from account where id = ?').get(account) as object).sort()).toEqual(['created_at', 'id', 'last_active_day']);
  });
});
