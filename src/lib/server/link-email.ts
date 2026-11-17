// Add an email address to the signed-in Account, from Settings (ADR 0016,
// "Accounts"). The reader proves the address with a Sign-in Code, from the
// store of the sign-in (sign-in-codes.ts), scoped to this browser session: the
// code works only in the session that asked it, and never at the sign-in. An
// address of another Account is refused once proved; nothing is merged. No
// address and no code reaches a log line.
import { requestLanguage } from '../i18n/i18n';
import { errorLogText, type Accounts } from './accounts';
import { cookieOf, sessionScope } from './auth';
import type { AuthStore } from './auth-store';
import { linkCodeMail, type SendMail } from './mail';
import { addressHash, normalEmail, type SignInCodes } from './sign-in-codes';

export interface LinkEmailDeps {
  accounts: Pick<Accounts, 'link' | 'identitiesOf'>;
  store: Pick<AuthStore, 'browserSession'>;
  codes: SignInCodes;
  sendMail: SendMail;
  site: string;
}

const hourMs = 3600 * 1000;
// Per Account; the limit per address is the one of the sign-in (same key), so
// an address gets no more mail than there.
const limits = {
  sendPerAccount: { max: 5, windowMs: hourMs },
  sendPerAddress: { max: 5, windowMs: hourMs },
  checkPerAccount: { max: 30, windowMs: 10 * 60 * 1000 },
};

const noStore = { 'cache-control': 'no-store' };
const answer = (status: number, error?: string) =>
  error ? Response.json({ error }, { status, headers: noStore }) : new Response(null, { status, headers: noStore });

async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => undefined);
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
}

// The signed-in Account and the scope of its codes, or undefined.
function signedIn(request: Request, store: LinkEmailDeps['store']) {
  const cookie = cookieOf(request);
  const reader = cookie ? store.browserSession(cookie) : undefined;
  return reader && cookie ? { account: reader.account, scope: sessionScope('link-email', cookie) } : undefined;
}

// POST /api/link/code { email }: mails a code to the address (204). 401
// signed out, 400 not an address, 409 HasEmail when the Account has one
// already, 429 past a limit. An address of another Account gets a code too:
// only its owner learns that, after the proof.
export async function sendLinkCode(request: Request, deps: LinkEmailDeps): Promise<Response> {
  const reader = signedIn(request, deps.store);
  if (!reader) return answer(401, 'SignedOut');
  const address = normalEmail((await bodyOf(request)).email);
  if (!address) return answer(400, 'BadAddress');
  if (deps.accounts.identitiesOf(reader.account).email) return answer(409, 'HasEmail');
  const { codes } = deps;
  if (!codes.allow(`link-send:${reader.account}`, limits.sendPerAccount.max, limits.sendPerAccount.windowMs)) return answer(429, 'TooMany');
  if (!codes.allow(`send-address:${addressHash(address)}`, limits.sendPerAddress.max, limits.sendPerAddress.windowMs)) return answer(429, 'TooMany');
  const mail = linkCodeMail(address, codes.issue(address, reader.scope), requestLanguage(request), deps.site);
  void deps.sendMail(mail).catch((error: unknown) => {
    console.warn(`Link code mail failed: ${errorLogText(error).replaceAll(address, '[address]')}`);
  });
  return answer(204);
}

// POST /api/link/check { email, code }: the right code of this session adds
// the address to the Account (204). 401 signed out; 400 WrongCode (wrong,
// used, expired, or asked in another session); 409 Taken (the address belongs
// to another Account) or HasEmail; 429 past the limit.
export async function checkLinkCode(request: Request, deps: LinkEmailDeps): Promise<Response> {
  const reader = signedIn(request, deps.store);
  if (!reader) return answer(401, 'SignedOut');
  const { checkPerAccount } = limits;
  if (!deps.codes.allow(`link-check:${reader.account}`, checkPerAccount.max, checkPerAccount.windowMs)) return answer(429, 'TooMany');
  const body = await bodyOf(request);
  const address = normalEmail(body.email);
  if (!address || typeof body.code !== 'string' || !/^\d{6}$/.test(body.code) || !deps.codes.check(address, body.code, reader.scope)) {
    return answer(400, 'WrongCode');
  }
  const result = deps.accounts.link(reader.account, 'email', address);
  if (result === 'taken') return answer(409, 'Taken');
  if (result === 'has-one') return answer(409, 'HasEmail');
  return answer(204);
}
