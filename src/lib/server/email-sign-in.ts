// Sign-in with an email address and a Sign-in Code (ADR 0016, "Sign-in"),
// written by hand in the instance's own tables. Sign-in and sign-up are one
// flow: "send me a code" gives the same answer for every address, so it never
// tells whether an address has an Account. An address with no Account and no
// open Invite gets no mail. No address and no code reaches a log line.
import { requestLanguage } from '../i18n/i18n';
import { errorLogText, NoInviteError, type AccountId, type Accounts } from './accounts';
import { cookieOf, inviteCookie, inviteCookieHeader, sessionCookieHeader } from './auth';
import { browserSessionLifetimeMs, type AuthStore } from './auth-store';
import { clientIp } from './client-ip';
import { signInCodeMail, type SendMail } from './mail';
import { addressHash, normalEmail, type SignInCodes } from './sign-in-codes';

export interface EmailSignInDeps {
  accounts: Pick<Accounts, 'signInEmail' | 'maySignInEmail'>;
  store: AuthStore;
  codes: SignInCodes;
  sendMail: SendMail;
  onSignedIn?: (account: AccountId) => Promise<void> | void;
}

const hourMs = 3600 * 1000;
// Codes asked per address and per IP, and codes checked per IP.
const limits = {
  sendPerAddress: { max: 5, windowMs: hourMs },
  sendPerIp: { max: 20, windowMs: hourMs },
  checkPerIp: { max: 30, windowMs: 10 * 60 * 1000 },
};

const noStore = { 'cache-control': 'no-store' };
const answer = (status: number, error?: string) =>
  error ? Response.json({ error }, { status, headers: noStore }) : new Response(null, { status, headers: noStore });

async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => undefined);
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
}

const allowed = (codes: SignInCodes, key: string, limit: { max: number; windowMs: number }) => codes.allow(key, limit.max, limit.windowMs);

// POST /api/sign-in/code { email }: 204 for every address (a mail goes only
// to an address with an Account, or with an open Invite in this browser),
// 400 for a value that is not an address, 429 past a limit. The mail is not
// awaited: the answer takes the same time for every address.
export async function sendCode(request: Request, deps: EmailSignInDeps, peer: string | undefined): Promise<Response> {
  const address = normalEmail((await bodyOf(request)).email);
  if (!address) return answer(400, 'BadAddress');
  if (!allowed(deps.codes, `send-ip:${clientIp(request, peer) ?? 'unknown'}`, limits.sendPerIp)) return answer(429, 'TooMany');
  if (!allowed(deps.codes, `send-address:${addressHash(address)}`, limits.sendPerAddress)) return answer(429, 'TooMany');
  if (deps.accounts.maySignInEmail(address, cookieOf(request, inviteCookie))) {
    const mail = signInCodeMail(address, deps.codes.issue(address), requestLanguage(request));
    void deps.sendMail(mail).catch((error: unknown) => {
      console.warn(`Sign-in Code mail failed: ${errorLogText(error).replaceAll(address, '[address]')}`);
    });
  }
  return answer(204);
}

// POST /api/sign-in/check { email, code }: the right code opens a browser
// session for the Account of the address (204 and the session cookie). An
// address with no Account makes one with the Invite kept in this browser,
// which is used up. A wrong, used, expired or killed code: 400; a right code
// with no open Invite: 403; past the limit: 429.
export async function checkCode(request: Request, deps: EmailSignInDeps, peer: string | undefined): Promise<Response> {
  const body = await bodyOf(request);
  const address = normalEmail(body.email);
  if (!allowed(deps.codes, `check-ip:${clientIp(request, peer) ?? 'unknown'}`, limits.checkPerIp)) return answer(429, 'TooMany');
  if (!address || typeof body.code !== 'string' || !/^\d{6}$/.test(body.code) || !deps.codes.check(address, body.code)) {
    return answer(400, 'WrongCode');
  }
  let account: AccountId;
  try {
    account = deps.accounts.signInEmail(address, cookieOf(request, inviteCookie));
  } catch (error) {
    if (error instanceof NoInviteError) return answer(403, 'NoInvite');
    throw error;
  }
  const { cookie } = deps.store.openBrowserSession({ account, handle: '' });
  void Promise.resolve()
    .then(() => deps.onSignedIn?.(account))
    .catch((error: unknown) => console.warn(`Sign-in follow-up failed: ${errorLogText(error)}`));
  const headers = new Headers(noStore);
  headers.append('set-cookie', sessionCookieHeader(cookie, browserSessionLifetimeMs / 1000));
  headers.append('set-cookie', inviteCookieHeader('', 0));
  return new Response(null, { status: 204, headers });
}
