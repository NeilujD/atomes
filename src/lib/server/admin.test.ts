// The admin request handler (ADR 0020, spec M13 "Testing Decisions" 1): the
// real stores over temporary SQLite files, requests as
// src/pages/api/admin/[...path].ts hands them over.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createCatalog, type Catalog } from '../catalog/catalog';
import { createAccounts, type AccountId, type Accounts, type Did } from './accounts';
import type { AccountRow, Totals } from './admin-accounts';
import { inviteLifetimeMs, makeInvite } from './invites';
import type { Mail, SendMail } from './mail';
import { sendCode } from './email-sign-in';
import { createSignInCodes, type SignInCodes } from './sign-in-codes';
import { publicRepo } from './public-repo';
import { fakePublicRepo } from './public-repo.fake';
import { createSharing, type RepoAccess, type Sharing } from './sharing';
import { readerOf } from './auth';
import type { AccountsRow, LogRow } from './admin';
import type { InviteRow } from './admin';
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
let codes: SignInCodes;
let sharing: Sharing;

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
  codes = createSignInCodes({ db: openDatabase(join(dir, 'auth.sqlite'), authSteps(accounts)) });
  outbox = [];
  sendMail = (mail) => {
    outbox.push(mail);
    return Promise.resolve();
  };
  library = createLibraryStore(openDatabase(file, librarySteps));
  catalog = createCatalog({ file: join(dir, 'catalog.sqlite'), fetch: () => Promise.reject(new TypeError('offline')), host: 'catalog.test', accounts });
  repoOf = () => Promise.resolve(undefined);
  sharing = createSharing({
    db: openDatabase(file, librarySteps),
    library,
    access: { repoOf: (did) => repoOf(did) },
    didOf: (account) => accounts.identitiesOf(account).did,
  });
});

afterEach(() => {
  sharing.close();
  codes.close();
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

// The fake mail outbox: no mail leaves a test.
let outbox: Mail[];
let sendMail: SendMail;
// The reader's public repo on their PDS: none until a test gives one.
let repoOf: RepoAccess['repoOf'];
const deps = () => ({
  store: auth,
  roles,
  accounts,
  admin: createAdminStore(db),
  catalog,
  site: app,
  sendMail,
  limits: codes,
  contact: 'ada@atomes.test',
  deletion: { accounts, library, sharing, auth, revoke: () => Promise.resolve(), catalog },
});

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
      // A bare 404: no body and no header of its own, so the app answers as for a path that does not exist.
      expect(await response.text()).toBe('');
      expect([...response.headers.keys()]).toEqual([]);
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

    // An Admin of now shows by identity, as actor and as target; the script as null.
    expect(lines.map(({ admin, action, target }) => ({ admin, action, target }))).toEqual([
      { admin: 'test.reader', action: 'role.grant', target: 'test.reader' },
      { admin: null, action: 'role.grant', target: 'test.reader' },
    ]);
  });

  test('a former Admin is a reader again: the log and the Admins part name them by Account Reference only', async () => {
    const first = accounts.ofEmail('first@example.org');
    roles.grant(first, null);
    const cookie = asAdmin(alice);
    signedInEmail('carol@example.org');
    roles.grant(accounts.ofEmail('carol@example.org'), first);
    roles.revoke(first, accounts.ofDid(alice));

    const log = await (await call(cookie, 'GET', '/api/admin/log')).text();
    const admins = (await json(await call(cookie, 'GET', '/api/admin/admins'))) as { admins: Body[] };

    expect(log).not.toContain('first@');
    expect(log).toContain(accountReference(first));
    expect(admins.admins.find(({ name }) => name === 'carol@example.org')).toMatchObject({ grantedBy: accountReference(first) });
  });

  test('a line older than 12 months is not shown, also when no write came since', () => {
    const admin = createAdminStore(db);
    const now = Date.UTC(2026, 10, 20, 12);
    admin.write({ admin: null, action: 'invite.make', target: null, detail: 'kept' }, now);

    expect(admin.log(Date.UTC(2027, 10, 20, 11)).map(({ detail }) => detail)).toEqual(['kept']);
    expect(admin.log(Date.UTC(2027, 10, 20, 13))).toEqual([]);
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
    (await json(await call(cookie, 'GET', `/api/admin/accounts${query}`))) as unknown as { totals: Totals; accounts: AccountsRow[] };
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
      invited: [],
      canDelete: true,
    });
    // The Account that Bob invited, for the delete dialog; an Admin cannot be deleted from the panel.
    expect(row(bobAccount).invited).toEqual([accountReference(carol)]);
    expect(row(admin).canDelete).toBe(false);
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
    expect(Object.keys(db.prepare('select * from account where id = ?').get(account) as object).sort()).toEqual(['added_by_admin', 'created_at', 'id', 'last_active_day']);
  });
});

describe('the Invites part', () => {
  const make = (cookie: string, body: unknown) => call(cookie, 'POST', '/api/admin/invites', body);
  const tokenOf = (link: string) => link.split('#invite=')[1];
  const list = async (cookie: string) => ((await json(await call(cookie, 'GET', '/api/admin/invites'))) as unknown as { invites: InviteRow[] }).invites;
  const inviteCount = () => (db.prepare('select count(*) as n from invite').get() as { n: number }).n;

  test('an Admin makes Invites with a label: links on the instance origin, each works once, for 14 days, with the Admin as maker', async () => {
    const cookie = asAdmin(alice);
    const before = Date.now();

    const response = await make(cookie, { count: 3, label: '  Book club ' });

    expect(response.status).toBe(201);
    const { links, expiresAt } = (await json(response)) as { links: string[]; expiresAt: number };
    expect(links).toHaveLength(3);
    expect(new Set(links).size).toBe(3);
    for (const link of links) expect(link).toMatch(/^https:\/\/atomes\.test\/sign-in#invite=[A-Za-z0-9_-]{43}$/);
    expect(expiresAt).toBeGreaterThanOrEqual(before + inviteLifetimeMs);
    expect(db.prepare('select distinct origin, label, made_by as madeBy from invite').all()).toEqual([
      { origin: 'admin', label: 'Book club', madeBy: accounts.ofDid(alice) },
    ]);
    // Once: the first sign-up uses it up.
    const carol = accounts.signInEmail('carol@example.org', tokenOf(links[0]));
    expect(accounts.inviteIsOpen(tokenOf(links[0]))).toBe(false);
    expect(accounts.maySignInEmail('dave@example.org', tokenOf(links[0]))).toBe(false);
    expect(accounts.inviteIsOpen(tokenOf(links[1]))).toBe(true);
    // The instance keeps only the hash of a token.
    expect(JSON.stringify(db.prepare('select * from invite').all())).not.toContain(tokenOf(links[1]));
    expect(everyValue()).not.toContain(tokenOf(links[1]));
    // The new Account started with an Admin Invite and its label.
    const { accounts: rows } = (await json(await call(cookie, 'GET', '/api/admin/accounts'))) as unknown as { accounts: AccountRow[] };
    expect(rows.find(({ account }) => account === carol)!.start).toEqual({ kind: 'admin-invite', label: 'Book club' });
  });

  test('one log line for a make, with the count and the label and no link', async () => {
    const cookie = asAdmin(alice);
    const before = logLines().length;

    await make(cookie, { count: 2, label: 'Friends' });
    await make(cookie, { count: 1 });

    expect(logLines().slice(before)).toEqual([
      { admin: accounts.ofDid(alice), action: 'invite.make', target: null, detail: '2 · Friends' },
      { admin: accounts.ofDid(alice), action: 'invite.make', target: null, detail: '1' },
    ]);
  });

  test('a count out of 1 to 50 or a label over 60 characters is refused on the server, and nothing is made', async () => {
    const cookie = asAdmin(alice);

    for (const count of [0, 51, 1.5, -1, '3', null, undefined]) expect((await make(cookie, { count })).status).toBe(400);
    expect((await make(cookie, { count: 1, label: 'x'.repeat(61) })).status).toBe(400);
    expect((await make(cookie, { count: 1, label: 7 })).status).toBe(400);
    expect(inviteCount()).toBe(0);

    expect((await make(cookie, { count: 50, label: 'x'.repeat(60) })).status).toBe(201);
    expect(inviteCount()).toBe(50);
  });

  test('panel Invites and the reader Invite of the same Admin do not mix', async () => {
    const cookie = asAdmin(alice);
    const admin = accounts.ofDid(alice);
    const { links } = (await json(await make(cookie, { count: 2 }))) as { links: string[] };
    accounts.signInEmail('carol@example.org', tokenOf(links[0]));

    // A person used a panel Invite: the reader Invite of the Admin is still to make.
    expect(accounts.inviteOf(admin)).toEqual({ state: 'none' });
    const mine = accounts.makeInvite(admin);
    expect(mine).toBeDefined();
    // A new reader Invite removes only the unused reader Invite, not the open panel Invite.
    const again = accounts.makeInvite(admin)!;
    expect(accounts.inviteIsOpen(mine!.token)).toBe(false);
    expect(accounts.inviteIsOpen(tokenOf(links[1]))).toBe(true);

    // The reverse: the reader Invite is used up, and the panel still makes Invites.
    accounts.signInEmail('dave@example.org', again.token);
    expect(accounts.inviteOf(admin)).toEqual({ state: 'used' });
    expect(accounts.makeInvite(admin)).toBeUndefined();
    expect((await make(cookie, { count: 1 })).status).toBe(201);
  });

  test('the list shows every Invite with its origin, label, state and days, and names Accounts by Account Reference only', async () => {
    const cookie = asAdmin(alice);
    const admin = accounts.ofDid(alice);
    const { links } = (await json(await make(cookie, { count: 2, label: 'Friends' }))) as { links: string[] };
    const carol = accounts.signInEmail('carol@example.org', tokenOf(links[0]));
    makeInvite(db);
    makeInvite(db, Date.now() - inviteLifetimeMs - 1000);
    accounts.makeInvite(carol);

    const response = await call(cookie, 'GET', '/api/admin/invites');
    const text = await response.clone().text();
    const invites = ((await json(response)) as unknown as { invites: InviteRow[] }).invites;

    const shape = ({ origin, label, state, madeBy, usedBy, canRevoke }: InviteRow) => ({ origin, label, state, madeBy, usedBy, canRevoke });
    expect(invites.map(shape).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))).toEqual(
      [
        { origin: 'admin', label: 'Friends', state: 'used', madeBy: accountReference(admin), usedBy: accountReference(carol), canRevoke: false },
        { origin: 'admin', label: 'Friends', state: 'open', madeBy: accountReference(admin), usedBy: null, canRevoke: true },
        { origin: 'script', label: null, state: 'open', madeBy: null, usedBy: null, canRevoke: true },
        { origin: 'script', label: null, state: 'expired', madeBy: null, usedBy: null, canRevoke: false },
        { origin: 'reader', label: null, state: 'open', madeBy: accountReference(carol), usedBy: null, canRevoke: false },
      ].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    );
    const used = invites.find(({ state }) => state === 'used')!;
    expect(used.usedAt).toEqual(expect.any(Number));
    expect(Math.abs(used.madeAt - Date.now())).toBeLessThan(60_000);
    for (const secret of ['carol@', 'example.org', 'test.reader', 'did:', tokenOf(links[1])]) expect(text).not.toContain(secret);
  });

  test('revoke removes an open Invite of an Admin or of the script: the link then fails as an unknown Invite', async () => {
    const cookie = asAdmin(alice);
    const { links } = (await json(await make(cookie, { count: 1, label: 'Friends' }))) as { links: string[] };
    const script = makeInvite(db);
    const before = logLines().length;

    for (const { id } of await list(cookie)) expect((await call(cookie, 'POST', '/api/admin/invites/revoke', { id })).status).toBe(200);

    expect(inviteCount()).toBe(0);
    expect(accounts.inviteIsOpen(tokenOf(links[0]))).toBe(false);
    expect(accounts.inviteIsOpen(script.token)).toBe(false);
    expect(() => accounts.signInEmail('carol@example.org', tokenOf(links[0]))).toThrow();
    const lines = logLines().slice(before);
    expect(lines.map(({ admin, action }) => ({ admin, action }))).toEqual([
      { admin: accounts.ofDid(alice), action: 'invite.revoke' },
      { admin: accounts.ofDid(alice), action: 'invite.revoke' },
    ]);
    expect(lines.map(({ detail }) => detail).sort()).toEqual(['Friends', null]);
  });

  test('a used Invite, an expired one and a reader Invite cannot be revoked', async () => {
    const cookie = asAdmin(alice);
    const { links } = (await json(await make(cookie, { count: 1 }))) as { links: string[] };
    const carol = accounts.signInEmail('carol@example.org', tokenOf(links[0]));
    makeInvite(db, Date.now() - inviteLifetimeMs - 1000);
    accounts.makeInvite(carol);
    const before = logLines().length;

    for (const { id } of await list(cookie)) expect((await call(cookie, 'POST', '/api/admin/invites/revoke', { id })).status).toBe(409);
    expect((await call(cookie, 'POST', '/api/admin/invites/revoke', { id: 'unknown' })).status).toBe(409);

    expect(inviteCount()).toBe(3);
    expect(logLines()).toHaveLength(before);
  });

  test('an Invite of the script keeps the script origin', () => {
    makeInvite(db);

    expect(db.prepare('select origin, made_by as madeBy, label from invite').all()).toEqual([{ origin: 'script', madeBy: null, label: null }]);
  });
});

describe('add an Account', () => {
  const add = (cookie: string, email: unknown, language: unknown = 'en') => call(cookie, 'POST', '/api/admin/accounts', { email, language });
  const accountCount = () => (db.prepare('select count(*) as n from account').get() as { n: number }).n;

  test('the Account exists at once with the address as its identity, no Invite, and shows as added by an Admin', async () => {
    const cookie = asAdmin(alice);

    const response = await add(cookie, '  Carol@Example.ORG ');

    expect(response.status).toBe(201);
    const carol = roles.accountOf('carol@example.org')!;
    expect(await json(response)).toEqual({ reference: accountReference(carol), mailSent: true });
    expect(accounts.identitiesOf(carol as AccountId)).toEqual({ email: 'carol@example.org' });
    expect(db.prepare('select count(*) as n from invite').get()).toEqual({ n: 0 });
    const { accounts: rows } = (await json(await call(cookie, 'GET', '/api/admin/accounts'))) as unknown as { accounts: AccountRow[] };
    expect(rows.find(({ account }) => account === carol)).toMatchObject({ start: { kind: 'added' }, signIn: 'email', lastActiveDay: null, flags: [] });
    // One log line: the Account ID as the target, no address.
    expect(logLines().at(-1)).toEqual({ admin: accounts.ofDid(alice), action: 'account.add', target: carol, detail: null });
    expect(everyValue()).not.toContain('carol@');
  });

  test.each([
    ['en', 'An Atomes Account was made for you', 'An Admin of this Atomes instance made an Account for you', 'ask for its delete'],
    ['fr', 'Un compte Atomes a été créé pour vous', 'Un administrateur de cette instance Atomes a créé un compte pour vous', 'demandez sa suppression'],
  ] as const)('%s: one mail in the selected language, with a text part and an HTML part, the sign-in page and the contact', async (language, subject, lead, refuse) => {
    const cookie = asAdmin(alice);

    await add(cookie, 'carol@example.org', language);

    expect(outbox).toHaveLength(1);
    const [mail] = outbox;
    expect(mail).toMatchObject({ to: 'carol@example.org', subject });
    for (const part of [mail.text, mail.html!]) {
      expect(part).toContain(lead);
      expect(part).toContain(refuse);
      expect(part).toContain('ada@atomes.test');
      // The link is the plain sign-in page of the instance: no token, no query, no fragment.
      expect(part).toContain('https://atomes.test/sign-in');
      expect(part).not.toMatch(/sign-in[?#]/);
      expect(part).not.toContain('invite');
    }
    expect(mail.html).toContain(`<html lang="${language}"`);
  });

  test('the person signs in with the address and a Sign-in Code, with no Invite, and lands in an empty Library', async () => {
    const cookie = asAdmin(alice);
    await add(cookie, 'carol@example.org');
    const carol = roles.accountOf('carol@example.org') as AccountId;

    expect(accounts.maySignInEmail('carol@example.org', undefined)).toBe(true);
    expect(accounts.signInEmail('carol@example.org', undefined)).toBe(carol);
    expect(library.changesSince(carol, 0).records).toEqual([]);
  });

  test('sign-in still gives the same answer for an address with an Account and one with none', async () => {
    const cookie = asAdmin(alice);
    await add(cookie, 'carol@example.org');
    const ask = (email: string) =>
      sendCode(new Request(`${app}/api/sign-in/code`, { method: 'POST', body: JSON.stringify({ email }) }), { accounts, store: auth, codes, sendMail, site: app }, '203.0.113.7');

    const known = await ask('carol@example.org');
    const unknown = await ask('nobody@example.org');

    expect([known.status, await known.text()]).toEqual([unknown.status, await unknown.text()]);
  });

  test('an address that has an Account: the panel says so, no mail goes, nothing changes', async () => {
    const cookie = asAdmin(alice);
    accounts.ofEmail('carol@example.org');
    const before = { accounts: accountCount(), log: logLines().length };

    const response = await add(cookie, 'CAROL@example.org');

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({ error: 'Exists' });
    expect(outbox).toEqual([]);
    expect(accountCount()).toBe(before.accounts);
    // The Admin learned that the address has an Account: one search line, with the Account and no address.
    expect(logLines().slice(before.log)).toEqual([{ admin: accounts.ofDid(alice), action: 'identity.find', target: accounts.ofEmail('carol@example.org'), detail: null }]);
    expect(everyValue()).not.toContain('carol@');
  });

  test('a text that is not an address, or a language the app does not have, is refused', async () => {
    const cookie = asAdmin(alice);
    const before = accountCount();

    expect((await add(cookie, 'not an address')).status).toBe(400);
    expect((await add(cookie, 42)).status).toBe(400);
    expect((await add(cookie, 'carol@example.org', 'de')).status).toBe(400);
    expect(accountCount()).toBe(before);
    expect(outbox).toEqual([]);
  });

  test('when the mail fails, the Account stays and the answer says the mail did not go', async () => {
    const cookie = asAdmin(alice);
    sendMail = () => Promise.reject(new Error('SMTP refused carol@example.org'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await add(cookie, 'carol@example.org');

    expect(response.status).toBe(201);
    expect(await json(response)).toMatchObject({ mailSent: false });
    expect(roles.accountOf('carol@example.org')).toBeDefined();
    // No address reaches a log line.
    expect(JSON.stringify(warn.mock.calls)).not.toContain('carol@');
    warn.mockRestore();
  });

  test('an Admin adds 20 Accounts in one hour at most, a try for a known address counts too; another Admin is not held back', async () => {
    const cookie = asAdmin(alice);
    const other = asAdmin(bob);
    for (let i = 0; i < 19; i++) expect((await add(cookie, `reader${i}@example.org`)).status).toBe(201);
    expect((await add(cookie, 'reader0@example.org')).status).toBe(409);

    const over = await add(cookie, 'one-more@example.org');

    expect(over.status).toBe(429);
    expect(await json(over)).toEqual({ error: 'TooMany' });
    expect(roles.accountOf('one-more@example.org')).toBeUndefined();
    expect(outbox).toHaveLength(19);
    expect((await add(other, 'one-more@example.org')).status).toBe(201);
  });
});

describe('delete an Account', () => {
  const remove = (cookie: string, account: unknown, reference: unknown) => call(cookie, 'POST', '/api/admin/accounts/delete', { account, reference });
  const email = 'bob@example.test';

  // Every value of every row of the instance's SQLite files that holds one of these.
  function rowsHolding(values: readonly string[]): string[] {
    const found: string[] = [];
    for (const name of ['library.sqlite', 'auth.sqlite', 'catalog.sqlite']) {
      const file = new DatabaseSync(join(dir, name), { readOnly: true });
      const tables = file.prepare("select name from sqlite_master where type = 'table'").all() as { name: string }[];
      for (const { name: table } of tables) {
        for (const row of file.prepare(`select * from "${table}"`).all()) {
          const text = JSON.stringify(row);
          if (values.some((value) => text.includes(value))) found.push(`${name} ${table}`);
        }
      }
      file.close();
    }
    return found;
  }

  // What Bob has on the instance: the reader Invite he signed up with, records, Shared choices, an email
  // address, sessions, an OAuth session, a Series Correction, and an open Invite of his own.
  async function bobEverywhere() {
    const carol = accounts.ofEmail('carol@example.org');
    const account = accounts.signIn(bob, accounts.makeInvite(carol)!.token);
    const session = signedIn(bob);
    accounts.link(account, 'email', email);
    library.put(account, 'app.atomes.copy', 'one', { $type: 'app.atomes.copy' });
    library.put(carol, 'app.atomes.copy', 'hers', { $type: 'app.atomes.copy' });
    await sharing.setShared(account, 'labels', false);
    await sharing.setPrivate(account, 'wd:Q1', true);
    await auth.sessions<{ token: string }>().set(bob, { token: 'sealed' });
    const corrections = new DatabaseSync(join(dir, 'catalog.sqlite'));
    corrections.prepare("insert into series_correction (isbn, anchor, volume, account, created_at) values ('9780000000001', '9782723478991', 1, ?, '2026-11-16T10:00:00.000Z')").run(account);
    corrections.close();
    const open = accounts.makeInvite(account)!;
    expect(rowsHolding([account, email, bob]).length).toBeGreaterThan(5);
    return { account, carol, session, open };
  }

  test('the same full delete as "Delete my account": nothing of the Account stays but the Admin Log line', async () => {
    const cookie = asAdmin(alice);
    const { account, carol, session, open } = await bobEverywhere();

    const response = await remove(cookie, account, ` ${accountReference(account).toLowerCase()} `);

    expect(response.status).toBe(200);
    // No record, no session, no identity, no Invite, no role, no author: only the log names the Account, by its ID.
    expect(rowsHolding([account, email, bob])).toEqual(['library.sqlite admin_action']);
    expect(logLines().at(-1)).toEqual({ admin: accounts.ofDid(alice), action: 'account.delete', target: account, detail: null });
    // Its sessions stop on their next request; its open Invite is gone; the Invite it used stays used.
    expect(readerOf(request(session, 'GET', '/api/session'), { store: auth })).toBeUndefined();
    expect(accounts.inviteIsOpen(open.token)).toBe(false);
    expect(accounts.inviteOf(carol)).toEqual({ state: 'used' });
    expect(catalog.correctionAccount('9780000000001')).toBeUndefined();
    // The Account that invited it keeps everything.
    expect(library.changesSince(carol, 0).records).toHaveLength(1);
    // The Log part still names the deleted Account by its Account Reference.
    const { lines } = (await json(await call(cookie, 'GET', '/api/admin/log'))) as unknown as { lines: LogRow[] };
    expect(lines[0]).toMatchObject({ action: 'account.delete', target: accountReference(account) });
  });

  test('the delete of an Account does not touch the Account it invited', async () => {
    const cookie = asAdmin(alice);
    const { account, carol } = await bobEverywhere();

    await remove(cookie, carol, accountReference(carol));

    expect(accounts.identitiesOf(carol)).toEqual({});
    expect(accounts.identitiesOf(account)).toEqual({ did: bob, email });
    expect(library.changesSince(account, 0).records).toHaveLength(1);
  });

  test('a wrong Account Reference, or the one of another Account, changes nothing', async () => {
    const cookie = asAdmin(alice);
    const { account, carol } = await bobEverywhere();
    const before = logLines().length;

    for (const typed of ['A-WRONG1', accountReference(carol), '', undefined, 7]) {
      const response = await remove(cookie, account, typed);
      expect(response.status).toBe(400);
      expect(await json(response)).toEqual({ error: 'WrongReference' });
    }

    expect(accounts.identitiesOf(account)).toEqual({ did: bob, email });
    expect(library.changesSince(account, 0).records).toHaveLength(1);
    expect(logLines()).toHaveLength(before);
  });

  test('the server refuses the own Account of the Admin, the Account of an Admin, and an Account that does not exist', async () => {
    const cookie = asAdmin(alice);
    asAdmin(bob);
    const own = accounts.ofDid(alice);
    const other = accounts.ofDid(bob);
    const before = logLines().length;

    const refusals = [await remove(cookie, own, accountReference(own)), await remove(cookie, other, accountReference(other)), await remove(cookie, 'no-such-account', 'A-AAAAAA')];

    expect(refusals.map(({ status }) => status)).toEqual([403, 403, 409]);
    expect(await Promise.all(refusals.map(json))).toEqual([{ error: 'OwnAccount' }, { error: 'IsAdmin' }, { error: 'NoAccount' }]);
    expect(roles.admins().map(({ account }) => account).sort()).toEqual([own, other].sort());
    expect(logLines()).toHaveLength(before);
  });

  test('the Shared records go from the PDS; when it cannot be reached, the Account is deleted and the answer says they stay', async () => {
    const cookie = asAdmin(alice);
    const pds = fakePublicRepo(bob);
    repoOf = () => Promise.resolve(publicRepo(pds.handler, bob));
    const { account } = await bobEverywhere();
    library.put(account, 'app.atomes.readingStatus', 'wd:Q2', { $type: 'app.atomes.readingStatus', work: 'wd:Q2', isbn: '9782723478991', status: 'read', updatedAt: '2026-11-16T10:00:00.000Z' });
    await sharing.setShared(account, 'readingStatuses', true);
    expect(pds.records.size).toBe(1);
    pds.network.online = false;

    const response = await remove(cookie, account, accountReference(account));

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ sharedLeft: true });
    expect(rowsHolding([account, email, bob])).toEqual(['library.sqlite admin_action']);
    expect(pds.records.size).toBe(1);
  });

  test('with the PDS in reach, the Shared records are removed from it', async () => {
    const cookie = asAdmin(alice);
    const pds = fakePublicRepo(bob);
    repoOf = () => Promise.resolve(publicRepo(pds.handler, bob));
    const account = accounts.ofDid(bob);
    library.put(account, 'app.atomes.readingStatus', 'wd:Q1', { $type: 'app.atomes.readingStatus', work: 'wd:Q1', isbn: '9782723478991', status: 'read', updatedAt: '2026-11-16T10:00:00.000Z' });
    await sharing.setShared(account, 'readingStatuses', true);
    expect(pds.records.size).toBe(1);

    expect(await json(await remove(cookie, account, accountReference(account)))).toEqual({ sharedLeft: false });
    expect(pds.records.size).toBe(0);
  });
});

describe('identity', () => {
  const show = (cookie: string, account: unknown, reason?: unknown) => call(cookie, 'POST', '/api/admin/identity/show', { account, reason });
  const find = (cookie: string, email: unknown, reason?: unknown) => call(cookie, 'POST', '/api/admin/identity/find', { email, reason });
  const reason = 'Asked for the delete by mail';

  test('"Show identity" needs a reason of 3 to 200 characters: with none, no identity is in the answer and nothing is logged', async () => {
    const cookie = asAdmin(alice);
    const carol = accounts.ofEmail('carol@example.org');
    const before = logLines().length;

    for (const typed of [undefined, '', '  ', 'ab', ' ab ', 'x'.repeat(201), 42]) {
      const response = await show(cookie, carol, typed);
      expect(response.status).toBe(400);
      expect(await response.text()).not.toContain('carol');
    }
    expect(logLines()).toHaveLength(before);

    expect((await show(cookie, carol, 'abc')).status).toBe(200);
    expect((await show(cookie, carol, 'x'.repeat(200))).status).toBe(200);
  });

  test('the answer gives the email address, the handle or the DID of the Account, is never kept by a cache, and one log line holds the reason', async () => {
    const cookie = asAdmin(alice);
    const byEmail = accounts.ofEmail('carol@example.org');
    const both = accounts.ofEmail('dave@example.org');
    accounts.link(both, 'did', 'did:plc:dave');
    auth.openBrowserSession({ account: both, handle: 'dave.test' });
    const noHandle = accounts.ofDid('did:plc:erin');
    const before = logLines().length;

    const first = await show(cookie, byEmail, `  ${reason} `);
    expect(first.headers.get('cache-control')).toBe('no-store');
    expect(await json(first)).toEqual({ email: 'carol@example.org' });
    expect(await json(await show(cookie, both, reason))).toEqual({ email: 'dave@example.org', atproto: 'dave.test' });
    expect(await json(await show(cookie, noHandle, reason))).toEqual({ atproto: 'did:plc:erin' });

    const admin = accounts.ofDid(alice);
    expect(logLines().slice(before)).toEqual([
      { admin, action: 'identity.show', target: byEmail, detail: reason },
      { admin, action: 'identity.show', target: both, detail: reason },
      { admin, action: 'identity.show', target: noHandle, detail: reason },
    ]);
    expect(everyValue()).not.toContain('carol@');
  });

  test('"Show identity" of an Account that does not exist gives none', async () => {
    const cookie = asAdmin(alice);

    expect((await show(cookie, 'no-such-account', reason)).status).toBe(409);
  });

  test('"Find by email address" answers the Account Reference of the address, typed in any case, and logs the Account with the reason', async () => {
    const cookie = asAdmin(alice);
    const carol = accounts.ofEmail('carol@example.org');

    const response = await find(cookie, '  Carol@Example.ORG ', reason);

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ reference: accountReference(carol) });
    expect(logLines().at(-1)).toEqual({ admin: accounts.ofDid(alice), action: 'identity.find', target: carol, detail: reason });
    expect(everyValue()).not.toContain('carol@');
  });

  test('a search with no match answers no Account, and its log line has the reason, no target and no address', async () => {
    const cookie = asAdmin(alice);

    const response = await find(cookie, 'nobody@example.org', reason);

    expect(await json(response)).toEqual({ reference: null });
    expect(logLines().at(-1)).toEqual({ admin: accounts.ofDid(alice), action: 'identity.find', target: null, detail: reason });
    expect(everyValue()).not.toContain('nobody');
  });

  test('a search needs the same reason, and an email address', async () => {
    const cookie = asAdmin(alice);
    accounts.ofEmail('carol@example.org');
    const before = logLines().length;

    expect((await find(cookie, 'carol@example.org')).status).toBe(400);
    expect((await find(cookie, 'carol@example.org', 'ab')).status).toBe(400);
    expect((await find(cookie, 'not an address', reason)).status).toBe(400);
    expect(logLines()).toHaveLength(before);
  });

  test('the Admin Log keeps no email address: a reason or an Invite label that holds one is refused', async () => {
    const cookie = asAdmin(alice);
    const carol = accounts.ofEmail('carol@example.org');
    const before = logLines().length;

    const shown = await show(cookie, carol, 'carol@example.org asked for it');
    expect(shown.status).toBe(400);
    expect(await json(shown)).toEqual({ error: 'ReasonHasAddress' });
    expect((await find(cookie, 'carol@example.org', 'for carol@example.org')).status).toBe(400);
    expect((await call(cookie, 'POST', '/api/admin/invites', { count: 1, label: 'for bob@example.org' })).status).toBe(400);
    expect(logLines()).toHaveLength(before);
  });

  test('no other answer of the admin API names a reader', async () => {
    const cookie = asAdmin(alice);
    const carol = accounts.signInEmail('carol@example.org', makeInvite(db).token);
    accounts.link(carol, 'did', 'did:plc:carol');
    auth.openBrowserSession({ account: carol, handle: 'carol.test' });
    accounts.makeInvite(carol);
    await show(cookie, carol, reason);
    await find(cookie, 'carol@example.org', reason);

    for (const path of ['/api/admin/accounts', '/api/admin/invites', '/api/admin/admins', '/api/admin/log']) {
      const text = await (await call(cookie, 'GET', path)).text();
      for (const secret of ['carol@', 'carol.test', 'did:plc:carol']) expect(text).not.toContain(secret);
    }
  });
});
