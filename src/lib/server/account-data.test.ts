// The export and the delete of an Account (ADR 0012, ADR 0016, CORE-55): two
// readers on one instance, the real stores over temporary SQLite files, and the
// request handled as src/pages/api/account does: the Account comes from the
// browser session only.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { createCatalog, type Catalog } from '../catalog/catalog';
import { fakePublicRepo } from './public-repo.fake';
import { publicRepo } from './public-repo';
import { createAccounts, type AccountId, type Accounts, type Did } from './accounts';
import { handleAccountRequest } from './account-data';
import { readerOf, sessionCookie, signInAs } from './auth';
import { createAuthStore, type AuthStore } from './auth-store';
import { createLibraryStore, type LibraryStore } from './library-store';
import { openDatabase } from './migrate';
import { authSteps, librarySteps } from './migrations';
import { secretBox } from './secret-box';
import { createSharing, type RepoAccess, type Sharing } from './sharing';

const alice: Did = 'did:plc:alice';
const bob: Did = 'did:plc:bob';
const app = 'https://atomes.test';
const collections = [
  'app.atomes.copy',
  'app.atomes.follow',
  'app.atomes.label',
  'app.atomes.loan',
  'app.atomes.readingStatus',
  'app.atomes.toBuy',
];

let dir: string;
let accounts: Accounts;
let auth: AuthStore;
let library: LibraryStore;
let sharing: Sharing;
let catalog: Catalog;
// The reader's public repo on their PDS: none until a test gives one.
let repoOf: RepoAccess['repoOf'];

function open() {
  repoOf = () => Promise.resolve(undefined);
  const access: RepoAccess = { repoOf: (did) => repoOf(did) };
  catalog = createCatalog({ file: join(dir, 'catalog.sqlite'), fetch: () => Promise.reject(new TypeError('offline')), host: 'catalog.test' });
  const file = join(dir, 'library.sqlite');
  accounts = createAccounts(openDatabase(file, librarySteps));
  auth = createAuthStore({
    db: openDatabase(join(dir, 'auth.sqlite'), authSteps(accounts)),
    box: secretBox(randomBytes(32)),
    allowedDids: new Set([alice, bob]),
    accounts,
  });
  library = createLibraryStore(openDatabase(file, librarySteps));
  sharing = createSharing({ db: openDatabase(file, librarySteps), library, access, didOf: (account) => accounts.identitiesOf(account).did });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atomes-account-data-'));
  open();
});

afterEach(() => {
  catalog.close();
  sharing.close();
  library.close();
  auth.close();
  accounts.close();
  rmSync(dir, { recursive: true, force: true });
});

function signedIn(did: Did): string {
  const response = signInAs(new Request(`${app}/dev/sign-in-as?did=${encodeURIComponent(did)}`), { store: auth }, new Set([alice, bob]));
  return /atomes_session=([^;]*)/.exec(response.headers.get('set-cookie')!)![1];
}

function request(cookie: string, method: string, path: string): Promise<Response> {
  const request = new Request(`${app}${path}`, { method, headers: { cookie: `${sessionCookie}=${cookie}` } });
  const reader = readerOf(request, { store: auth })!;
  return handleAccountRequest(request, {
    account: reader.account,
    accounts,
    library,
    sharing,
    auth,
    revoke: () => Promise.resolve(),
    catalog,
  });
}

// One record in each collection, with the reader's name in it.
function fill(account: AccountId, name: string) {
  for (const collection of collections) library.put(account, collection, `${name}-1`, { $type: collection, owner: name });
}

test('the export holds every collection of the Account, Loans included, and no record of another Account', async () => {
  const a = signedIn(alice);
  signedIn(bob);
  fill(accounts.ofDid(alice), 'alice');
  fill(accounts.ofDid(bob), 'bob');
  library.put(accounts.ofDid(alice), 'app.atomes.copy', 'gone', { $type: 'app.atomes.copy', owner: 'alice' });
  library.delete(accounts.ofDid(alice), 'app.atomes.copy', 'gone');

  const response = await request(a, 'GET', '/api/account/export');

  expect(response.status).toBe(200);
  expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename="atomes-library-\d{4}-\d{2}-\d{2}\.json"$/);
  const body = (await response.json()) as { records: Record<string, { rkey: string; value: unknown }[]>; identities: unknown };
  expect(Object.keys(body.records).sort()).toEqual(collections);
  for (const collection of collections) {
    expect(body.records[collection]).toEqual([{ rkey: 'alice-1', value: { $type: collection, owner: 'alice' } }]);
  }
  expect(body.identities).toEqual({ atprotoAccount: alice });
  expect(JSON.stringify(body)).not.toContain('bob');
});

// Every value of every row of the instance's SQLite files that holds one of these.
function rowsHolding(values: readonly string[]): string[] {
  const found: string[] = [];
  for (const name of ['library.sqlite', 'auth.sqlite', 'catalog.sqlite']) {
    const db = new DatabaseSync(join(dir, name), { readOnly: true });
    const tables = db.prepare("select name from sqlite_master where type = 'table'").all() as { name: string }[];
    for (const { name: table } of tables) {
      for (const row of db.prepare(`select * from "${table}"`).all()) {
        const text = JSON.stringify(row);
        if (values.some((value) => text.includes(value))) found.push(`${name} ${table} ${text}`);
      }
    }
    db.close();
  }
  return found;
}

// What alice has on the instance: records, Shared choices, an email address,
// an OAuth session, and Series Corrections under her Account and, from before
// Accounts, under her DID.
async function aliceEverywhere() {
  const a = signedIn(alice);
  const b = signedIn(bob);
  const account = accounts.ofDid(alice);
  fill(account, 'alice');
  fill(accounts.ofDid(bob), 'bob');
  await sharing.setShared(account, 'labels', false);
  await sharing.setPrivate(account, 'wd:Q1', true);
  const email = 'alice@example.test';
  const db = new DatabaseSync(join(dir, 'library.sqlite'));
  db.prepare("insert into identity (account, kind, value) values (?, 'email', ?)").run(account, email);
  db.close();
  await auth.sessions<{ token: string }>().set(alice, { token: 'sealed' });
  const corrections = new DatabaseSync(join(dir, 'catalog.sqlite'));
  const correct = corrections.prepare(
    "insert into series_correction (isbn, anchor, volume, account, created_at) values (?, '9782723478991', 1, ?, '2026-11-16T10:00:00.000Z')",
  );
  correct.run('9780000000001', account);
  correct.run('9780000000002', alice);
  correct.run('9780000000003', accounts.ofDid(bob));
  corrections.close();
  expect(rowsHolding([account, email, alice]).length).toBeGreaterThan(0);
  return { a, b, account, email };
}

test('after a delete, no row of any table holds the Account ID, the email address or the DID; the other reader keeps everything', async () => {
  const { a, b, account, email } = await aliceEverywhere();
  const bobBefore = (await (await request(b, 'GET', '/api/account/export')).json()) as object;

  const response = await request(a, 'POST', '/api/account/delete');

  expect(response.status).toBe(200);
  expect(response.headers.get('set-cookie')).toMatch(/^atomes_session=; .*Max-Age=0/);
  expect(rowsHolding([account, email, alice])).toEqual([]);
  expect(readerOf(new Request(app, { headers: { cookie: `${sessionCookie}=${a}` } }), { store: auth })).toBeUndefined();
  expect({ ...((await (await request(b, 'GET', '/api/account/export')).json()) as object), exportedAt: 0 }).toEqual({ ...bobBefore, exportedAt: 0 });
  // The Corrections stay: other readers use them.
  expect(catalog.correctionAccount('9780000000001')).toBe('');
  expect(catalog.correctionAccount('9780000000002')).toBe('');
  expect(catalog.correctionAccount('9780000000003')).toBe(accounts.ofDid(bob));
});

test('a delete removes the Shared records from the PDS of the linked AT Protocol Account', async () => {
  const pds = fakePublicRepo(alice);
  repoOf = () => Promise.resolve(publicRepo(pds.handler, alice));
  const a = signedIn(alice);
  fill(accounts.ofDid(alice), 'alice');
  await sharing.setShared(accounts.ofDid(alice), 'readingStatuses', true);
  await sharing.setShared(accounts.ofDid(alice), 'labels', true);
  expect(pds.records.size).toBe(2);

  const response = await request(a, 'POST', '/api/account/delete');

  expect(await response.json()).toEqual({ sharedLeft: false });
  expect(pds.records.size).toBe(0);
});

test('a delete while the PDS is down still removes everything on the instance, and says the Shared records are left', async () => {
  const pds = fakePublicRepo(alice);
  repoOf = () => Promise.resolve(publicRepo(pds.handler, alice));
  const { a, account, email } = await aliceEverywhere();
  await sharing.setShared(account, 'readingStatuses', true);
  pds.network.online = false;

  const response = await request(a, 'POST', '/api/account/delete');

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ sharedLeft: true });
  expect(rowsHolding([account, email, alice])).toEqual([]);
  expect(pds.records.size).toBe(1);
});
