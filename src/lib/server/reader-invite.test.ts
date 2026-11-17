import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createAccounts, type Accounts } from './accounts';
import { sessionCookie, signInAs } from './auth';
import { createAuthStore, type AuthStore } from './auth-store';
import { makeInvite } from './invites';
import { openDatabase } from './migrate';
import { authSteps, librarySteps } from './migrations';
import { handleReaderInvite } from './reader-invite';
import { secretBox } from './secret-box';

const app = 'https://atomes.test';
let dir: string;
let accounts: Accounts;
let store: AuthStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atomes-reader-invite-'));
  accounts = createAccounts(openDatabase(join(dir, 'library.sqlite'), librarySteps));
  store = createAuthStore({ db: openDatabase(join(dir, 'auth.sqlite'), authSteps(accounts)), box: secretBox(randomBytes(32)) });
});

afterEach(() => {
  store.close();
  accounts.close();
  rmSync(dir, { recursive: true, force: true });
});

function signedIn(did: `did:${string}`): string {
  const response = signInAs(new Request(`${app}/dev/sign-in-as?did=${did}`), { store, accounts });
  return /atomes_session=([^;]*)/.exec(response.headers.get('set-cookie')!)![1];
}

function ask(method: 'GET' | 'POST', cookie?: string, body?: unknown): Response {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = `${sessionCookie}=${cookie}`;
  const request = new Request(`${app}/api/account/invite`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return handleReaderInvite(request, { store, accounts });
}

const make = (cookie: string) => ask('POST', cookie).json() as Promise<{ token: string; expiresAt: number }>;
const stateOf = (cookie: string) => ask('GET', cookie).json() as Promise<unknown>;

describe('/api/account/invite', () => {
  test('with no session: 401', () => {
    expect(ask('POST').status).toBe(401);
    expect(ask('GET', 'not-a-session').status).toBe(401);
  });

  test('a reader makes an Invite: the token comes once, and the state says open', async () => {
    const alice = signedIn('did:plc:alice');
    expect(await stateOf(alice)).toEqual({ state: 'none' });

    const response = ask('POST', alice);

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const { token, expiresAt } = (await response.json()) as { token: string; expiresAt: number };
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(accounts.inviteIsOpen(token)).toBe(true);
    const state = await stateOf(alice);
    expect(state).toEqual({ state: 'open', expiresAt });
    expect(JSON.stringify(state)).not.toContain(token);
  });

  test('a new link cancels the open one', async () => {
    const alice = signedIn('did:plc:alice');
    const first = await make(alice);

    const second = await make(alice);

    expect(accounts.inviteIsOpen(first.token)).toBe(false);
    expect(accounts.inviteIsOpen(second.token)).toBe(true);
  });

  test('once a person signed up with it: 403, and no new Invite', async () => {
    const alice = signedIn('did:plc:alice');
    accounts.signInEmail('bob@example.org', (await make(alice)).token);
    expect(await stateOf(alice)).toEqual({ state: 'used' });

    const response = ask('POST', alice);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: 'InviteUsed' });
    expect(await stateOf(alice)).toEqual({ state: 'used' });
  });

  test('the maker is the Account of the session, never a field of the request', async () => {
    const alice = signedIn('did:plc:alice');
    const carol = signedIn('did:plc:carol');
    accounts.signInEmail('bob@example.org', (await make(alice)).token);
    const aliceAccount = accounts.ofDid('did:plc:alice');

    const response = ask('POST', carol, { account: aliceAccount, madeBy: aliceAccount });

    expect(response.status).toBe(201);
    expect(await stateOf(carol)).toMatchObject({ state: 'open' });
  });

  test('two requests at once leave one open Invite', async () => {
    const alice = signedIn('did:plc:alice');

    const tokens = await Promise.all([make(alice), make(alice)]);

    expect(tokens.map(({ token }) => accounts.inviteIsOpen(token)).sort()).toEqual([false, true]);
  });

  test('an owner Invite counts for no reader', async () => {
    const alice = signedIn('did:plc:alice');
    const owner = openDatabase(join(dir, 'library.sqlite'), librarySteps);
    accounts.signInEmail('bob@example.org', makeInvite(owner).token);
    owner.close();

    expect(await stateOf(alice)).toEqual({ state: 'none' });
  });
});
