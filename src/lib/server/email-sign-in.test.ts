import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createAccounts, type Accounts } from './accounts';
import { inviteCookie, session, sessionCookie } from './auth';
import { createAuthStore, type AuthStore } from './auth-store';
import { checkCode, sendCode, type EmailSignInDeps } from './email-sign-in';
import { makeInvite } from './invites';
import type { Mail } from './mail';
import { openDatabase } from './migrate';
import { authSteps, librarySteps } from './migrations';
import { secretBox } from './secret-box';
import { codeAttempts, createSignInCodes, type SignInCodes } from './sign-in-codes';

const app = 'https://atomes.test';
const known = 'known@example.org';
const stranger = 'stranger@example.org';
const ip = '203.0.113.9';
// The Coolify proxy (ADR 0011): every request behind it has this connection
// address, and the reader's IP last in X-Forwarded-For.
const proxy = '10.0.1.5';
const behindProxy = (forwardedFor: string) => ({ 'x-forwarded-for': forwardedFor });

let dir: string;
let library: DatabaseSync;
let accounts: Accounts;
let store: AuthStore;
let codes: SignInCodes;
let mails: Mail[];
let deps: EmailSignInDeps;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atomes-email-'));
  library = openDatabase(':memory:', librarySteps);
  accounts = createAccounts(library);
  const file = join(dir, 'auth.sqlite');
  store = createAuthStore({ db: openDatabase(file, authSteps(accounts)), box: secretBox(randomBytes(32)) });
  codes = createSignInCodes({ db: openDatabase(file, authSteps(accounts)) });
  mails = [];
  deps = {
    accounts,
    store,
    codes,
    sendMail: (mail) => {
      mails.push(mail);
      return Promise.resolve();
    },
    site: 'https://atomes.example.org',
  };
  // The known reader made an Account with an Invite before.
  accounts.signInEmail(known, makeInvite(library).token);
});

afterEach(() => {
  store.close();
  codes.close();
  accounts.close();
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${app}${path}`, { method: 'POST', body: JSON.stringify(body), headers: { origin: app, 'content-type': 'application/json', ...headers } });
const askCode = (email: unknown, headers: Record<string, string> = {}, from = ip) => sendCode(post('/api/sign-in/code', { email }, headers), deps, from);
const tryCode = (email: unknown, code: unknown, headers: Record<string, string> = {}, from = ip) =>
  checkCode(post('/api/sign-in/check', { email, code }, headers), deps, from);
const invited = (invite: string) => ({ cookie: `${inviteCookie}=${invite}` });
const codeOf = (mail: Mail | undefined) => /\b(\d{6})\b/.exec(mail?.text ?? '')?.[1];
const sessionOf = (response: Response) => /atomes_session=([^;]*)/.exec(response.headers.get('set-cookie') ?? '')?.[1];
const accountCount = () => (library.prepare('select count(*) as n from account').get() as { n: number }).n;
const flushMail = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('send me a code', () => {
  test('a known address gets a mail with a 6-digit code, and no link in its text part', async () => {
    const answer = await askCode(' Known@Example.org ');
    await flushMail();

    expect(answer.status).toBe(204);
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe(known);
    expect(codeOf(mails[0])).toMatch(/^\d{6}$/);
    expect(mails[0].text).not.toMatch(/https?:|www\./);
  });

  test('the mail is in the language of the reader', async () => {
    await askCode(known, { 'accept-language': 'fr-FR,fr;q=0.9' });
    await flushMail();

    expect(mails[0].subject).toContain('code de connexion');
  });

  test('an unknown address with no Invite gets the same answer, and no mail', async () => {
    const forKnown = await askCode(known);
    const forStranger = await askCode(stranger);
    await flushMail();

    expect(forStranger.status).toBe(forKnown.status);
    expect(await forStranger.text()).toBe(await forKnown.text());
    expect(mails.map((mail) => mail.to)).toEqual([known]);
  });

  test('an unknown address with an open Invite gets a code', async () => {
    await askCode(stranger, invited(makeInvite(library).token));
    await flushMail();

    expect(mails.map((mail) => mail.to)).toEqual([stranger]);
  });

  test('a value that is not an address gets 400 and no mail', async () => {
    expect((await askCode('not an address')).status).toBe(400);
    expect((await askCode(undefined)).status).toBe(400);
    expect(mails).toEqual([]);
  });

  test('an address gets at most 5 codes an hour, from any IP', async () => {
    const answers = [];
    for (let i = 0; i < 6; i++) answers.push((await askCode(known, {}, `198.51.100.${i}`)).status);
    await flushMail();

    expect(answers).toEqual([204, 204, 204, 204, 204, 429]);
    expect(mails).toHaveLength(5);
  });

  test('an IP asks for at most 20 codes an hour, for any address', async () => {
    const answers = [];
    for (let i = 0; i < 21; i++) answers.push((await askCode(`reader${i}@example.org`)).status);

    expect(answers.slice(0, 20).every((status) => status === 204)).toBe(true);
    expect(answers[20]).toBe(429);
  });

  test('behind the proxy, each reader IP has its own limit', async () => {
    for (let i = 0; i < 20; i++) await askCode(`reader${i}@example.org`, behindProxy('198.51.100.1'), proxy);

    expect((await askCode('reader20@example.org', behindProxy('198.51.100.1'), proxy)).status).toBe(429);
    expect((await askCode('reader20@example.org', behindProxy('198.51.100.2'), proxy)).status).toBe(204);
  });

  test('behind the proxy, entries the client writes before the last one do not change the IP that is counted', async () => {
    const answers = [];
    for (let i = 0; i < 21; i++) answers.push((await askCode(`reader${i}@example.org`, behindProxy(`192.0.2.${i}, 198.51.100.1`), proxy)).status);

    expect(answers[19]).toBe(204);
    expect(answers[20]).toBe(429);
  });

  test('a mail that fails is logged with no address and no code; the answer stays the same', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    deps.sendMail = () => Promise.reject(new Error(`550 mailbox ${known} unavailable`));

    expect((await askCode(known)).status).toBe(204);
    await flushMail();

    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.flat().join(' ')).not.toContain('known@');
  });
});

describe('check the code', () => {
  async function codeFor(address: string, headers: Record<string, string> = {}) {
    await askCode(address, headers);
    await flushMail();
    return codeOf(mails.findLast((mail) => mail.to === address))!;
  }

  test('the right code signs in to the Account of the address', async () => {
    const code = await codeFor(known);

    const answer = await tryCode('KNOWN@example.org', code);

    expect(answer.status).toBe(204);
    expect(answer.headers.get('set-cookie')).toMatch(/atomes_session=[^;]+; Path=\/; HttpOnly; Secure; SameSite=Lax/);
    const signedIn = session(new Request(`${app}/api/session`, { headers: { cookie: `${sessionCookie}=${sessionOf(answer)}` } }), { store, accounts });
    expect(await signedIn.json()).toMatchObject({ email: known });
    expect(accountCount()).toBe(1);
  });

  test('a wrong code is refused, with no session', async () => {
    const code = await codeFor(known);

    const answer = await tryCode(known, code === '000000' ? '000001' : '000000');

    expect(answer.status).toBe(400);
    expect(await answer.json()).toMatchObject({ error: 'WrongCode' });
    expect(answer.headers.get('set-cookie')).toBeNull();
  });

  test('5 wrong codes kill the code: the right code is refused after that', async () => {
    const code = await codeFor(known);
    const wrong = code === '000000' ? '000001' : '000000';
    for (let i = 0; i < codeAttempts; i++) await tryCode(known, wrong);

    expect((await tryCode(known, code)).status).toBe(400);
  });

  test('a used code is refused', async () => {
    const code = await codeFor(known);
    await tryCode(known, code);

    expect((await tryCode(known, code)).status).toBe(400);
  });

  test('a code that is not 6 digits is refused', async () => {
    await codeFor(known);

    expect((await tryCode(known, '12345')).status).toBe(400);
    expect((await tryCode(known, 123456)).status).toBe(400);
  });

  test('a new address with an open Invite makes an Account, and the Invite is used up', async () => {
    const { token } = makeInvite(library);
    const code = await codeFor(stranger, invited(token));

    const answer = await tryCode(stranger, code, invited(token));

    expect(answer.status).toBe(204);
    expect(answer.headers.getSetCookie()).toContainEqual(expect.stringMatching(/^atomes_invite=; .*Max-Age=0/));
    expect(accountCount()).toBe(2);
    expect(accounts.inviteIsOpen(token)).toBe(false);
  });

  test("the owner's Account of a preview (ofEmail at start) signs in with a code and no Invite; a restart makes no second one", async () => {
    const owner = accounts.ofEmail('owner@example.org');
    expect(accounts.ofEmail('owner@example.org')).toBe(owner);
    const code = await codeFor('owner@example.org');

    const answer = await tryCode('owner@example.org', code);

    expect(answer.status).toBe(204);
    expect(accountCount()).toBe(2);
  });

  test('a new address whose Invite was used meanwhile is refused, and no Account is made', async () => {
    const { token } = makeInvite(library);
    const code = await codeFor(stranger, invited(token));
    accounts.signInEmail('first@example.org', token);

    const answer = await tryCode(stranger, code, invited(token));

    expect(answer.status).toBe(403);
    expect(await answer.json()).toMatchObject({ error: 'NoInvite' });
    expect(accountCount()).toBe(2);
  });

  test('an IP checks at most 30 codes in 10 minutes', async () => {
    const answers = [];
    for (let i = 0; i < 31; i++) answers.push((await tryCode(`reader${i}@example.org`, '123456')).status);

    expect(answers[29]).toBe(400);
    expect(answers[30]).toBe(429);
  });

  test('behind the proxy, each reader IP has its own check limit, and forged entries do not change it', async () => {
    for (let i = 0; i < 30; i++) await tryCode(`reader${i}@example.org`, '123456', behindProxy(`192.0.2.${i}, 198.51.100.1`), proxy);

    expect((await tryCode('reader30@example.org', '123456', behindProxy('192.0.2.99, 198.51.100.1'), proxy)).status).toBe(429);
    expect((await tryCode('reader30@example.org', '123456', behindProxy('198.51.100.2'), proxy)).status).toBe(400);
  });
});
