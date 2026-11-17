import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createAccounts, type AccountId, type Accounts, type Did } from './accounts';
import { session, sessionCookie } from './auth';
import { createAuthStore, type AuthStore } from './auth-store';
import { checkCode, sendCode } from './email-sign-in';
import { makeInvite } from './invites';
import { checkLinkCode, sendLinkCode, type LinkEmailDeps } from './link-email';
import type { Mail, SendMail } from './mail';
import { openDatabase } from './migrate';
import { authSteps, librarySteps } from './migrations';
import { secretBox } from './secret-box';
import { createSignInCodes, type SignInCodes } from './sign-in-codes';

const app = 'https://atomes.test';
const reader: Did = 'did:plc:reader';
const address = 'reader@example.org';

let dir: string;
let library: DatabaseSync;
let accounts: Accounts;
let store: AuthStore;
let codes: SignInCodes;
let mails: Mail[];
// Every port in full: the sign-in routes run on the same deps.
let deps: LinkEmailDeps & { accounts: Accounts; store: AuthStore; sendMail: SendMail };
let account: AccountId;
let cookie: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atomes-link-email-'));
  library = openDatabase(':memory:', librarySteps);
  accounts = createAccounts(library);
  const file = join(dir, 'auth.sqlite');
  store = createAuthStore({ db: openDatabase(file, authSteps(accounts)), box: secretBox(randomBytes(32)) });
  codes = createSignInCodes({ db: openDatabase(file, authSteps(accounts)) });
  mails = [];
  const sendMail = (mail: Mail) => {
    mails.push(mail);
    return Promise.resolve();
  };
  deps = { accounts, store, codes, sendMail, site: 'https://atomes.example.org' };
  // An Account made with an AT Protocol Account, signed in on this browser.
  account = accounts.ofDid(reader);
  cookie = store.openBrowserSession({ account, handle: 'reader.test' }).cookie;
});

afterEach(() => {
  store.close();
  codes.close();
  accounts.close();
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const post = (path: string, body: unknown, from = cookie) =>
  new Request(`${app}${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { origin: app, 'content-type': 'application/json', cookie: `${sessionCookie}=${from}` },
  });
const askCode = (email: unknown, from = cookie) => sendLinkCode(post('/api/link/code', { email }, from), deps);
const tryCode = (email: unknown, code: unknown, from = cookie) => checkLinkCode(post('/api/link/check', { email, code }, from), deps);
const codeOf = (mail: Mail | undefined) => /\b(\d{6})\b/.exec(mail?.text ?? '')?.[1];
const flushMail = () => new Promise((resolve) => setTimeout(resolve, 0));
async function mailedCode(email = address, from = cookie) {
  expect((await askCode(email, from)).status).toBe(204);
  await flushMail();
  return codeOf(mails.at(-1))!;
}

describe('add an email address', () => {
  test('the right code adds the address to the Account; the reader then signs in with it to the same Account', async () => {
    const code = await mailedCode(' Reader@Example.org ');
    expect(mails.at(-1)!.to).toBe(address);

    expect((await tryCode(address, code)).status).toBe(204);
    expect(accounts.identitiesOf(account)).toEqual({ did: reader, email: address });

    // Signed out, the reader signs in with a Sign-in Code to the same Account.
    const signInDeps = deps;
    const ip = '203.0.113.1';
    const asked = await sendCode(
      new Request(`${app}/api/sign-in/code`, { method: 'POST', body: JSON.stringify({ email: address }), headers: { origin: app } }),
      signInDeps,
      ip,
    );
    expect(asked.status).toBe(204);
    await flushMail();
    const signedIn = await checkCode(
      new Request(`${app}/api/sign-in/check`, { method: 'POST', body: JSON.stringify({ email: address, code: codeOf(mails.at(-1)) }), headers: { origin: app } }),
      signInDeps,
      ip,
    );
    expect(signedIn.status).toBe(204);
    const newCookie = /atomes_session=([^;]*)/.exec(signedIn.headers.get('set-cookie') ?? '')![1];
    const who = (await session(new Request(`${app}/api/session`, { headers: { cookie: `${sessionCookie}=${newCookie}` } }), deps).json()) as {
      id: string;
    };
    expect(who.id).toBe(account);
  });

  test('a wrong code adds nothing', async () => {
    const code = await mailedCode();
    const wrong = code === '000000' ? '111111' : '000000';

    const answer = await tryCode(address, wrong);

    expect(answer.status).toBe(400);
    expect(await answer.json()).toEqual({ error: 'WrongCode' });
    expect(accounts.identitiesOf(account).email).toBeUndefined();
  });

  test('signed out: 401, and no mail', async () => {
    expect((await askCode(address, 'no-such-session')).status).toBe(401);
    await flushMail();
    expect(mails).toHaveLength(0);
  });

  test('an Account that has an address already cannot add a second one', async () => {
    await tryCode(address, await mailedCode());

    const answer = await askCode('second@example.org');

    expect(answer.status).toBe(409);
    expect(await answer.json()).toEqual({ error: 'HasEmail' });
    expect(accounts.identitiesOf(account).email).toBe(address);
  });

  test('a link code never signs in: the sign-in check refuses it', async () => {
    const code = await mailedCode();

    const signedIn = await checkCode(
      new Request(`${app}/api/sign-in/check`, { method: 'POST', body: JSON.stringify({ email: address, code }), headers: { origin: app } }),
      deps,
      '203.0.113.1',
    );

    expect(signedIn.status).toBe(400);
  });

  test('too many codes asked: 429', async () => {
    for (let i = 0; i < 5; i += 1) expect((await askCode(address)).status).toBe(204);

    expect((await askCode(address)).status).toBe(429);
  });

  test('no address and no code reaches a log line', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    deps.sendMail = () => Promise.reject(new Error(`SMTP refused ${address}`));

    await askCode(address);
    await flushMail();
    await tryCode(address, '123456');

    const lines = [...warn.mock.calls, ...log.mock.calls].flat().join('\n');
    expect(lines).not.toContain(address);
    expect(lines).not.toContain(reader);
  });
});

describe('security: add an email address', () => {
  test('an address of Account A cannot be added to Account B: refused with a plain answer, nothing merged', async () => {
    const other = accounts.signInEmail(address, makeInvite(library).token);

    const answer = await tryCode(address, await mailedCode());

    expect(answer.status).toBe(409);
    expect(await answer.json()).toEqual({ error: 'Taken' });
    expect(accounts.identitiesOf(account)).toEqual({ did: reader });
    expect(accounts.identitiesOf(other)).toEqual({ email: address });
  });

  test('a code asked in one session cannot be used in another session, even of the same Account', async () => {
    const code = await mailedCode();
    const otherBrowser = store.openBrowserSession({ account, handle: 'reader.test' }).cookie;

    const answer = await tryCode(address, code, otherBrowser);

    expect(answer.status).toBe(400);
    expect(accounts.identitiesOf(account).email).toBeUndefined();
    // The session that asked still can.
    expect((await tryCode(address, code)).status).toBe(204);
  });

  test('a code asked by Account A cannot add the address to Account B', async () => {
    const code = await mailedCode();
    const intruder = accounts.ofDid('did:plc:intruder');
    const intruderCookie = store.openBrowserSession({ account: intruder, handle: 'intruder.test' }).cookie;

    expect((await tryCode(address, code, intruderCookie)).status).toBe(400);
    expect(accounts.identitiesOf(intruder).email).toBeUndefined();
  });
});

