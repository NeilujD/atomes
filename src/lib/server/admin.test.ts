// The admin request handler (ADR 0020, spec M13 "Testing Decisions" 1): the
// real stores over temporary SQLite files, requests as
// src/pages/api/admin/[...path].ts hands them over.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createAccounts, type Accounts, type Did } from './accounts';
import { adminOf, handleAdminRequest } from './admin';
import { session, sessionCookie, signInAs } from './auth';
import { createAuthStore, type AuthStore } from './auth-store';
import { openDatabase } from './migrate';
import { authSteps, librarySteps } from './migrations';
import { createRoles, type Roles } from './roles';
import { secretBox } from './secret-box';

const app = 'https://atomes.test';
const alice: Did = 'did:plc:alice';
const bob: Did = 'did:plc:bob';

let dir: string;
let db: DatabaseSync;
let accounts: Accounts;
let auth: AuthStore;
let roles: Roles;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atomes-admin-'));
  const file = join(dir, 'library.sqlite');
  db = openDatabase(file, librarySteps);
  accounts = createAccounts(openDatabase(file, librarySteps));
  auth = createAuthStore({ db: openDatabase(join(dir, 'auth.sqlite'), authSteps(accounts)), box: secretBox(randomBytes(32)) });
  roles = createRoles(db);
});

afterEach(() => {
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

const deps = () => ({ store: auth, roles });

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

    roles.revoke(accounts.ofDid(alice));

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
