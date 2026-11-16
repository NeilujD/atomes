// Sign-in on the server (ADR 0013): the server holds the reader's OAuth session
// and gives the browser only its own session cookie. The OAuth client sits
// behind a small port (oauth.ts), so tests never call a PDS.
import { returnTarget, signInPath } from '../auth/return-to';
import { errorLogText, NoInviteError, type AccountId, type Accounts, type Did } from './accounts';
import { type AuthStore, browserSessionLifetimeMs } from './auth-store';

export interface OAuthPort {
  // The DID of the handle, resolved by this server.
  didOf(handle: string): Promise<Did>;
  // The PDS page that asks the reader to sign in. Keeps `returnTo` on the
  // server for the callback.
  authorize(handle: string, returnTo: string): Promise<URL>;
  // Finishes the sign-in that comes back from the PDS. Gives the reader's DID
  // and the `returnTo` of its authorize.
  callback(params: URLSearchParams): Promise<{ did: Did; returnTo?: string }>;
  // The handle of the DID, or the DID when it has none.
  handleOf(did: Did): Promise<string>;
  // Ends the OAuth session: revokes it on the PDS and deletes it here.
  revoke(did: Did): Promise<void>;
}

// What the sign-in screen tells after a failed sign-in (`?auth=` in its URL).
export type SignInResult = 'no-invite' | 'cancelled' | 'no-account' | 'unreachable' | 'failed';

// A sign-in failure the OAuth port could name.
export class SignInError extends Error {
  constructor(
    readonly result: SignInResult,
    options?: ErrorOptions,
  ) {
    super(`Sign-in failed: ${result}`, options);
    this.name = 'SignInError';
  }
}

export interface AuthDeps {
  oauth: OAuthPort;
  store: AuthStore;
  // The Accounts and Invites in library.sqlite. Sign-out ends the OAuth
  // session of the DID of the Account.
  accounts: Pick<Accounts, 'identitiesOf' | 'signIn' | 'maySignIn' | 'inviteIsOpen' | 'ofDid'>;
  // PUBLIC_APP_ORIGIN; undefined in local development.
  appOrigin?: string;
  // After a sign-in: sharing sends what waited for the reader's session
  // (sharing.ts). Not awaited; a failure is logged and the sign-in goes on.
  onSignedIn?: (account: AccountId) => Promise<void> | void;
}

export const sessionCookie = 'atomes_session';

// HttpOnly: no script reads it. Secure: https only (browsers also send it to
// http://127.0.0.1). SameSite=Lax: sent when the PDS sends the reader back.
export function sessionCookieHeader(value: string, maxAgeSeconds: number): string {
  return `${sessionCookie}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

// The Invite opened in this browser, kept for the sign-in that follows
// (keepInvite). HttpOnly and SameSite=Lax as the session cookie; sent only
// to /oauth, the sign-in and its callback. One hour: open the link again after.
export const inviteCookie = 'atomes_invite';
const inviteCookieHeader = (value: string, maxAgeSeconds: number) =>
  `${inviteCookie}=${value}; Path=/oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;

function cookieOf(request: Request, cookie = sessionCookie): string | undefined {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === cookie) return value.join('=') || undefined;
  }
  return undefined;
}

const goTo = (location: string, setCookies: string[] = []) => {
  const headers = new Headers({ location });
  for (const cookie of setCookies) headers.append('set-cookie', cookie);
  return new Response(null, { status: 303, headers });
};

// Back to the sign-in screen, which tells the result and keeps the return target.
function back(result: SignInResult, returnTo = '/') {
  const query = new URLSearchParams({ auth: result });
  if (returnTo !== '/') query.set('next', returnTo);
  return goTo(`${signInPath}?${query}`);
}

function resultOf(error: unknown): SignInResult {
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    if (cause instanceof NoInviteError) return 'no-invite';
    if (cause instanceof SignInError) return cause.result;
  }
  return 'failed';
}

// An OAuth error never carries a token; a DID or an Account ID is left out.
// No Invite token reaches a log line: no error holds one.
function logFailure(step: string, error: unknown) {
  console.warn(`Sign-in ${step} failed: ${errorLogText(error)}`);
}

// POST /api/invite, from the sign-in screen opened with an Invite link
// (`/sign-in#invite=<token>`: the fragment never reaches a server log, and the
// screen drops it from the address). Keeps an open Invite in its cookie: 204;
// a used, expired or unknown one: 410, and nothing is kept.
export async function keepInvite(request: Request, { accounts }: Pick<AuthDeps, 'accounts'>): Promise<Response> {
  const body = (await request.json().catch(() => undefined)) as { invite?: unknown } | undefined;
  const invite = body?.invite;
  if (typeof invite !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(invite) || !accounts.inviteIsOpen(invite)) {
    return Response.json({ error: 'InviteUsed' }, { status: 410, headers: { 'cache-control': 'no-store' } });
  }
  return new Response(null, { status: 204, headers: { 'set-cookie': inviteCookieHeader(invite, 3600), 'cache-control': 'no-store' } });
}

// POST /oauth/sign-in, from the sign-in screen: `handle`, and `next`, the
// screen to land on after the sign-in. A DID with no Account and no open
// Invite is refused before the PDS page: the reader does not sign in for nothing.
export async function signIn(request: Request, { oauth, accounts }: AuthDeps): Promise<Response> {
  const form = await request.formData().catch(() => undefined);
  const field = form?.get('handle');
  const handle = typeof field === 'string' ? field.trim().replace(/^@/, '') : '';
  const returnTo = returnTarget(form?.get('next'));
  if (!handle) return back('no-account', returnTo);
  try {
    if (!accounts.maySignIn(await oauth.didOf(handle), cookieOf(request, inviteCookie))) throw new NoInviteError();
    return goTo((await oauth.authorize(handle, returnTo)).href);
  } catch (error) {
    logFailure('start', error);
    return back(resultOf(error), returnTo);
  }
}

// GET /oauth/callback: the PDS sends the reader back here. Signed in, the
// reader lands on the screen asked first. A failure goes back to the sign-in
// screen, with no return target. A DID with no Account makes one with the
// kept Invite, which is used up; with none, its new OAuth session ends at once.
export async function callback(request: Request, { oauth, store, accounts, onSignedIn }: AuthDeps): Promise<Response> {
  try {
    const { did, returnTo } = await oauth.callback(new URL(request.url).searchParams);
    let account: AccountId;
    try {
      account = accounts.signIn(did, cookieOf(request, inviteCookie));
    } catch (error) {
      if (error instanceof NoInviteError) await oauth.revoke(did).catch((revokeError: unknown) => logFailure('revoke', revokeError));
      throw error;
    }
    const { cookie } = store.openBrowserSession({ account, handle: await oauth.handleOf(did) });
    void Promise.resolve()
      .then(() => onSignedIn?.(account))
      .catch((error: unknown) => logFailure('follow-up', error));
    return goTo(returnTarget(returnTo), [sessionCookieHeader(cookie, browserSessionLifetimeMs / 1000), inviteCookieHeader('', 0)]);
  } catch (error) {
    logFailure('callback', error);
    return back(resultOf(error));
  }
}

// GET /dev/sign-in-as, development only: a browser session for the Account of
// `did` (default: did:plc:testreader) with no PDS, so agents and the E2E
// readers can test the app. The Account is made at its first sign-in with no
// Invite. The Library API reads only the browser session. A value that is not
// a DID gets 400 and nothing is written.
export function signInAs(request: Request, { store, accounts }: { store: AuthStore; accounts: Pick<Accounts, 'ofDid'> }): Response {
  const query = new URL(request.url).searchParams;
  const did = query.get('did') ?? 'did:plc:testreader';
  if (!/^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/.test(did)) return new Response(null, { status: 400 });
  const { cookie } = store.openBrowserSession({ account: accounts.ofDid(did as Did), handle: query.get('handle') ?? 'test.reader' });
  return goTo('/library', [sessionCookieHeader(cookie, browserSessionLifetimeMs / 1000)]);
}

// POST /oauth/sign-out. Ends the browser session and removes the cookie. The
// OAuth session ends too when no other browser of the reader is signed in.
export async function signOut(request: Request, { oauth, store, accounts }: AuthDeps): Promise<Response> {
  const cookie = cookieOf(request);
  const account = cookie && store.closeBrowserSession(cookie);
  const did = account && !store.hasBrowserSessions(account) ? accounts.identitiesOf(account).did : undefined;
  let pdsReached = true;
  if (did) {
    pdsReached = await oauth.revoke(did).then(
      () => true,
      (error: unknown) => {
        logFailure('revoke', error);
        return false;
      },
    );
  }
  return Response.json({ pdsReached }, { headers: { 'set-cookie': sessionCookieHeader('', 0), 'cache-control': 'no-store' } });
}

// The reader of this request, or undefined when signed out.
export function readerOf(request: Request, { store }: Pick<AuthDeps, 'store'>) {
  const cookie = cookieOf(request);
  return cookie ? store.browserSession(cookie) : undefined;
}

export const signedOut = () =>
  Response.json({ error: 'SignedOut', message: 'Sign in again' }, { status: 401, headers: { 'cache-control': 'no-store' } });

// GET /api/session: who is signed in, for the device: { id, handle?, email? }.
// `id` is the Account; the device keys its local copy with it.
export function session(request: Request, deps: Pick<AuthDeps, 'store' | 'accounts'>): Response {
  const reader = readerOf(request, deps);
  if (!reader) return signedOut();
  const { email } = deps.accounts.identitiesOf(reader.account);
  return Response.json({ id: reader.account, handle: reader.handle, email }, { headers: { 'cache-control': 'no-store' } });
}
