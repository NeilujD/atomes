// Sign-in on the server (ADR 0013): the server holds the reader's OAuth session
// and gives the browser only its own session cookie. The OAuth client sits
// behind a small port (oauth.ts), so tests never call a PDS.
import { returnTarget, signInPath } from '../auth/return-to';
import { NotAllowedError, type AuthStore, browserSessionLifetimeMs } from './auth-store';

export interface OAuthPort {
  // The PDS page that asks the reader to sign in. Refuses a DID that is not
  // allowed when the handle resolves, before the reader leaves. Keeps
  // `returnTo` on the server for the callback.
  authorize(handle: string, returnTo: string): Promise<URL>;
  // Finishes the sign-in that comes back from the PDS. Gives the reader's DID
  // and the `returnTo` of its authorize.
  callback(params: URLSearchParams): Promise<{ did: string; returnTo?: string }>;
  // The handle of the DID, or the DID when it has none.
  handleOf(did: string): Promise<string>;
  // Ends the OAuth session: revokes it on the PDS and deletes it here.
  revoke(did: string): Promise<void>;
}

// What the sign-in screen tells after a failed sign-in (`?auth=` in its URL).
export type SignInResult = 'not-allowed' | 'cancelled' | 'no-account' | 'unreachable' | 'failed';

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
  // PUBLIC_APP_ORIGIN; undefined in local development.
  appOrigin?: string;
}

export const sessionCookie = 'atomes_session';

// HttpOnly: no script reads it. Secure: https only (browsers also send it to
// http://127.0.0.1). SameSite=Lax: sent when the PDS sends the reader back.
export function sessionCookieHeader(value: string, maxAgeSeconds: number): string {
  return `${sessionCookie}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function cookieOf(request: Request): string | undefined {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === sessionCookie) return value.join('=') || undefined;
  }
  return undefined;
}

const goTo = (location: string, headers: Record<string, string> = {}) =>
  new Response(null, { status: 303, headers: { location, ...headers } });

// Back to the sign-in screen, which tells the result and keeps the return target.
function back(result: SignInResult, returnTo = '/') {
  const query = new URLSearchParams({ auth: result });
  if (returnTo !== '/') query.set('next', returnTo);
  return goTo(`${signInPath}?${query}`);
}

function resultOf(error: unknown): SignInResult {
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    if (cause instanceof NotAllowedError) return 'not-allowed';
    if (cause instanceof SignInError) return cause.result;
  }
  return 'failed';
}

// Names only: an OAuth error never carries a token, but keep the log short.
function logFailure(step: string, error: unknown) {
  const name = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
  console.warn(`Sign-in ${step} failed: ${name}`);
}

// POST /oauth/sign-in, from the sign-in screen: `handle`, and `next`, the
// screen to land on after the sign-in.
export async function signIn(request: Request, { oauth }: AuthDeps): Promise<Response> {
  const form = await request.formData().catch(() => undefined);
  const field = form?.get('handle');
  const handle = typeof field === 'string' ? field.trim().replace(/^@/, '') : '';
  const returnTo = returnTarget(form?.get('next'));
  if (!handle) return back('no-account', returnTo);
  try {
    return goTo((await oauth.authorize(handle, returnTo)).href);
  } catch (error) {
    logFailure('start', error);
    return back(resultOf(error), returnTo);
  }
}

// GET /oauth/callback: the PDS sends the reader back here. Signed in, the
// reader lands on the screen asked first. A failure goes back to the sign-in
// screen, with no return target.
export async function callback(request: Request, { oauth, store }: AuthDeps): Promise<Response> {
  try {
    const { did, returnTo } = await oauth.callback(new URL(request.url).searchParams);
    const cookie = store.openBrowserSession({ did, handle: await oauth.handleOf(did) });
    return goTo(returnTarget(returnTo), { 'set-cookie': sessionCookieHeader(cookie, browserSessionLifetimeMs / 1000) });
  } catch (error) {
    logFailure('callback', error);
    return back(resultOf(error));
  }
}

// GET /dev/sign-in-as, development only: a browser session for `did` (default:
// the first allowed DID) with no PDS, so agents can test the app by hand. The
// Library API reads only the browser session. A DID that is not allowed gets
// 403 and nothing is written.
export function signInAs(request: Request, { store }: Pick<AuthDeps, 'store'>, allowedDids: ReadonlySet<string>): Response {
  const query = new URL(request.url).searchParams;
  const did = query.get('did') ?? [...allowedDids][0] ?? '';
  try {
    const cookie = store.openBrowserSession({ did, handle: query.get('handle') ?? 'test.reader' });
    return goTo('/library', { 'set-cookie': sessionCookieHeader(cookie, browserSessionLifetimeMs / 1000) });
  } catch (error) {
    if (error instanceof NotAllowedError) return new Response(null, { status: 403 });
    throw error;
  }
}

// POST /oauth/sign-out. Ends the browser session and removes the cookie. The
// OAuth session ends too when no other browser of the reader is signed in.
export async function signOut(request: Request, { oauth, store }: AuthDeps): Promise<Response> {
  const cookie = cookieOf(request);
  const did = cookie && store.closeBrowserSession(cookie);
  let pdsReached = true;
  if (did && !store.hasBrowserSessions(did)) {
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

// GET /api/session: who is signed in, for the device.
export function session(request: Request, deps: Pick<AuthDeps, 'store'>): Response {
  const reader = readerOf(request, deps);
  return reader ? Response.json(reader, { headers: { 'cache-control': 'no-store' } }) : signedOut();
}
