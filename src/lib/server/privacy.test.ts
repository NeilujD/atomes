// Every request acts for the Account of its browser session only (ADR 0016):
// two readers on one instance, the real stores over one library.sqlite, and the
// request handled as the API pages do (src/pages/api/library, src/pages/api/sharing).
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createAccounts, type Accounts, type Did } from './accounts';
import { callback, readerOf, sessionCookie, signInAs, signOut, type OAuthPort } from './auth';
import { createAuthStore, type AuthStore } from './auth-store';
import { handleLibraryRequest, lexiconRules } from './library-api';
import { createLibraryStore, type LibraryStore } from './library-store';
import { openDatabase } from './migrate';
import { authSteps, librarySteps } from './migrations';
import { secretBox } from './secret-box';
import { createSharing, type Sharing } from './sharing';
import { handleSharingRequest } from './sharing-api';

const alice: Did = 'did:plc:alice';
const bob: Did = 'did:plc:bob';
const app = 'https://atomes.test';
const collection = 'app.atomes.readingStatus';
const status = (work: string, state: string) => ({ $type: collection, work, isbn: '9782723478991', status: state, updatedAt: '2026-11-16T10:00:00.000Z' });

let dir: string;
let accounts: Accounts;
let auth: AuthStore;
let library: LibraryStore;
let sharing: Sharing;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atomes-privacy-'));
  const file = join(dir, 'library.sqlite');
  accounts = createAccounts(openDatabase(file, librarySteps));
  auth = createAuthStore({
    db: openDatabase(join(dir, 'auth.sqlite'), authSteps(accounts)),
    box: secretBox(randomBytes(32)),
  });
  library = createLibraryStore(openDatabase(file, librarySteps));
  sharing = createSharing({
    db: openDatabase(file, librarySteps),
    library,
    // No PDS: the choices are still saved, and stay pending.
    access: { repoOf: () => Promise.resolve(undefined) },
    didOf: (account) => accounts.identitiesOf(account).did,
  });
});

afterEach(() => {
  sharing.close();
  library.close();
  auth.close();
  accounts.close();
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function signedIn(did: Did): string {
  const response = signInAs(new Request(`${app}/dev/sign-in-as?did=${encodeURIComponent(did)}`), { store: auth, accounts });
  return /atomes_session=([^;]*)/.exec(response.headers.get('set-cookie')!)![1];
}

// As src/pages/api/library and src/pages/api/sharing: the Account comes from the cookie only.
async function request(cookie: string, method: string, path: string, body?: unknown): Promise<Response> {
  const request = new Request(`${app}${path}`, {
    method,
    headers: { cookie: `${sessionCookie}=${cookie}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const reader = readerOf(request, { store: auth })!;
  return path.startsWith('/api/sharing')
    ? handleSharingRequest(request, { account: reader.account, sharing })
    : handleLibraryRequest(request, { account: reader.account, store: library, rules: lexiconRules });
}

test("a request of Account A never reads or writes a row of Account B, whatever it names", async () => {
  const a = signedIn(alice);
  const b = signedIn(bob);
  const bobAccount = accounts.ofDid(bob);
  await request(b, 'PUT', `/api/library/${collection}/wd:Q1`, status('wd:Q1', 'read'));
  await request(b, 'PUT', '/api/sharing/categories/labels', { shared: false });
  await request(b, 'PUT', '/api/sharing/private-works/wd:Q9', { private: true });
  const bobBefore: unknown = await (await request(b, 'GET', '/api/library?since=0')).json();
  const bobSharing: unknown = await (await request(b, 'GET', '/api/sharing')).json();

  // Reads: nothing of Bob, even when the request names his Account or DID.
  const names = `account=${bobAccount}&did=${encodeURIComponent(bob)}`;
  expect(await (await request(a, 'GET', `/api/library?since=0&${names}`)).json()).toEqual({ rev: 0, all: true, records: [], deleted: [] });
  expect(await (await request(a, 'GET', `/api/library/${collection}?${names}`)).json()).toEqual({ records: [] });
  expect((await request(a, 'GET', `/api/library/${collection}/wd:Q1?${names}`)).status).toBe(404);
  expect(await (await request(a, 'GET', `/api/sharing?${names}`)).json()).toMatchObject({ privateWorks: [], shared: { labels: false } });

  // Writes: Alice's own rows, never Bob's.
  await request(a, 'PUT', `/api/library/${collection}/wd:Q1?${names}`, { ...status('wd:Q1', 'abandoned'), account: bobAccount });
  await request(a, 'DELETE', `/api/library/${collection}/wd:Q1?${names}`);
  await request(a, 'PUT', `/api/sharing/categories/follows?${names}`, { shared: false, account: bobAccount, did: bob });
  await request(a, 'PUT', `/api/sharing/private-works/wd:Q9?${names}`, { private: false, account: bobAccount });
  await request(a, 'PUT', `/api/sharing/private-works?${names}`, { works: ['wd:Q7'], private: true, account: bobAccount });

  expect(await (await request(b, 'GET', '/api/library?since=0')).json()).toEqual(bobBefore);
  expect(await (await request(b, 'GET', '/api/sharing')).json()).toEqual(bobSharing);
  expect(await (await request(a, 'GET', '/api/sharing')).json()).toMatchObject({ privateWorks: ['wd:Q7'] });
});

test('no log line holds a DID or an Account ID, even when an error names them', async () => {
  const lines: string[] = [];
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, level).mockImplementation((...parts: unknown[]) => void lines.push(parts.map(String).join(' ')));
  }
  const cookie = signedIn(alice);
  const account = accounts.ofDid(alice);
  // Errors of other libraries may name the DID or the Account.
  const failing = new Error(`Did document for "${alice}" of ${account} could not be read`);
  const oauth: OAuthPort = {
    didOf: () => Promise.resolve(alice),
    authorize: () => Promise.reject(failing),
    callback: () => Promise.resolve({ did: alice }),
    handleOf: () => Promise.resolve('alice.test'),
    revoke: () => Promise.reject(failing),
  };
  const deps = { oauth, store: auth, accounts, onSignedIn: () => Promise.reject(failing) };
  const mirror = createSharing({
    db: openDatabase(join(dir, 'library.sqlite'), librarySteps),
    library,
    access: { repoOf: () => Promise.reject(failing) },
    didOf: () => alice,
  });

  await callback(new Request(`${app}/oauth/callback?code=c&state=s`), deps);
  await signOut(new Request(`${app}/oauth/sign-out`, { method: 'POST', headers: { cookie: `${sessionCookie}=${cookie}` } }), deps);
  await callback(new Request(`${app}/oauth/callback?code=c&state=s`), { ...deps, oauth: { ...oauth, callback: () => Promise.reject(failing) } });
  await mirror.setShared(account, 'labels', false);
  await mirror.recordChanged(account, 'app.atomes.label', '3l2a');
  await handleSharingRequest(new Request(`${app}/api/sharing/categories/labels`, { method: 'PUT', body: '{"shared":true}' }), { account, sharing: mirror });
  await vi.waitFor(() => expect(lines.some((line) => line.includes('follow-up'))).toBe(true));
  mirror.close();

  expect(lines.length).toBeGreaterThanOrEqual(5);
  for (const line of lines) {
    expect(line).not.toContain(alice);
    expect(line).not.toContain(account);
  }
});
