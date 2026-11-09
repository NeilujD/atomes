// Sign-in on the server (ADR 0013): the server holds the reader's OAuth session
// and gives the browser only its own session cookie. The OAuth client sits
// behind a small port (oauth.ts), so tests never call a PDS.
import { NotAllowedError, type AuthStore, browserSessionLifetimeMs } from './auth-store';

export interface OAuthPort {
  // The PDS page that asks the reader to sign in. Refuses a DID that is not
  // allowed when the handle resolves, before the reader leaves.
  authorize(handle: string): Promise<URL>;
  // Finishes the sign-in that comes back from the PDS. Gives the reader's DID.
  callback(params: URLSearchParams): Promise<{ did: string }>;
  // The handle of the DID, or the DID when it has none.
  handleOf(did: string): Promise<string>;
  // Ends the OAuth session: revokes it on the PDS and deletes it here.
  revoke(did: string): Promise<void>;
}

// What the Settings page tells after a sign-in (`?auth=` in its URL).
export type SignInResult = 'signed-in' | 'not-allowed' | 'cancelled' | 'no-account' | 'unreachable' | 'failed';

// A sign-in failure the OAuth port could name.
export class SignInError extends Error {
  constructor(
    readonly result: Exclude<SignInResult, 'signed-in'>,
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
export const settingsPath = '/settings';

// HttpOnly: no script reads it. Secure: https only (browsers also send it to
// http://127.0.0.1). SameSite=Lax: sent when the PDS sends the reader back.
export function sessionCookieHeader(value: string, maxAgeSeconds: number): string {
  return `${sessionCookie}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

// Every request that writes must come from the app's own pages (CSRF, ADR 0013),
// on top of SameSite=Lax. With no PUBLIC_APP_ORIGIN (local development), the
// origin the browser asked: the Host header, since the built server can put
// `localhost` in the request URL for any host.
export function isSameOrigin(request: Request, appOrigin?: string): boolean {
  const url = new URL(request.url);
  const own = appOrigin ?? `${url.protocol}//${request.headers.get('host') ?? url.host}`;
  return request.headers.get('origin') === own;
}

function cookieOf(request: Request): string | undefined {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === sessionCookie) return value.join('=') || undefined;
  }
  return undefined;
}

const back = (result: SignInResult, headers: Record<string, string> = {}) =>
  new Response(null, { status: 303, headers: { location: `${settingsPath}?auth=${result}`, ...headers } });

function resultOf(error: unknown): Exclude<SignInResult, 'signed-in'> {
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

// POST /oauth/sign-in, from the Settings form.
export async function signIn(request: Request, { oauth }: AuthDeps): Promise<Response> {
  const field = (await request.formData().catch(() => undefined))?.get('handle');
  const handle = typeof field === 'string' ? field.trim().replace(/^@/, '') : '';
  if (!handle) return back('no-account');
  try {
    return new Response(null, { status: 303, headers: { location: (await oauth.authorize(handle)).href } });
  } catch (error) {
    logFailure('start', error);
    return back(resultOf(error));
  }
}

// GET /oauth/callback: the PDS sends the reader back here.
export async function callback(request: Request, { oauth, store }: AuthDeps): Promise<Response> {
  try {
    const { did } = await oauth.callback(new URL(request.url).searchParams);
    const cookie = store.openBrowserSession({ did, handle: await oauth.handleOf(did) });
    return back('signed-in', { 'set-cookie': sessionCookieHeader(cookie, browserSessionLifetimeMs / 1000) });
  } catch (error) {
    logFailure('callback', error);
    return back(resultOf(error));
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
