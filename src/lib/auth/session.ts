// The reader's sign-in state on the device, over a small port so tests can use
// a fake client. The server holds the OAuth session (ADR 0013): the device
// never holds, logs or sends a token, only the session cookie the browser keeps.
import { t } from '../i18n/i18n';
import { isNetworkFailure } from '../network';
import type { LocalCopy } from '../space/local-copy';
import { signInHref } from './return-to';

// The Account signed in (ADR 0016), as /api/session answers. `id` keys the
// local copy; on a device that has not reached the server since Accounts, it
// is still the reader's DID (server-client.ts).
export interface Account {
  id: string;
  handle?: string;
  email?: string;
  // An AT Protocol Account is linked (Settings offers to link one when not).
  atproto?: boolean;
}

export interface AuthClient {
  // Who is signed in. With the server out of reach: the account this device saw last.
  init(): Promise<Account | undefined>;
  // Sends the window to the server, which sends it to the PDS sign-in page.
  // After the sign-in, the server sends it to `returnTo`.
  signIn(handle: string, returnTo: string): Promise<void>;
  // Ends the session on the server and removes the cookie.
  signOut(): Promise<void>;
}

export type AuthState = { status: 'signed-out'; message?: string } | { status: 'signed-in'; account: Account };

// Offline with no saved account, the sign-in screen says it needs the network.
export async function loadSession(client: Pick<AuthClient, 'init'>): Promise<AuthState> {
  try {
    const account = await client.init();
    return account ? { status: 'signed-in', account } : { status: 'signed-out' };
  } catch (error) {
    return { status: 'signed-out', message: isNetworkFailure(error) ? t('auth.needs-network') : errorMessage(error) };
  }
}

// Every app screen needs a signed-in reader (ADR 0013, amendment 2026-11-12).
// Gives the sign-in screen to go to, with the screen `asked` as its return
// target, or undefined to stay: signed in, offline with a saved account
// (ADR 0002), or a server error the screen tells itself. It runs in the
// browser, not the server: the service worker keeps app screens, and a server
// redirect would put the sign-in screen in their place.
export async function gate(client: Pick<AuthClient, 'init'>, asked: string): Promise<string | undefined> {
  try {
    if (await client.init()) return undefined;
  } catch (error) {
    if (!isNetworkFailure(error)) return undefined;
  }
  return signInHref(asked);
}

// Resolves only when the sign-in does not leave the page.
export async function signIn(client: AuthClient, input: string, returnTo: string): Promise<AuthState> {
  const handle = input.trim().replace(/^@/, '');
  if (!handle) return { status: 'signed-out', message: t('auth.type-handle') };
  try {
    await client.signIn(handle, returnTo);
    return { status: 'signed-out' };
  } catch (error) {
    return { status: 'signed-out', message: errorMessage(error) };
  }
}

// Clears what the device keeps for the reader first (device-data.ts), so it
// goes even when the server cannot be reached. The session ends even when that
// clearing fails.
export async function signOut(
  client: AuthClient,
  account: Account,
  device: Pick<LocalCopy, 'clear'>,
): Promise<Extract<AuthState, { status: 'signed-out' }>> {
  const cleared = await device.clear().then(
    () => true,
    () => false,
  );
  const ended = await client.signOut().then(
    () => true,
    () => false,
  );
  // Data left on the device matters more than a session left on the server.
  if (!cleared) return { status: 'signed-out', message: t('auth.signed-out-data-left') };
  if (!ended) return { status: 'signed-out', message: t('auth.signed-out-server-unreached') };
  return { status: 'signed-out' };
}

// What the server tells after a failed sign-in, as `?auth=` on the sign-in
// screen (SignInResult in src/lib/server/auth.ts). Undefined for an unknown value.
const results: Partial<Record<string, () => string>> = {
  'no-invite': () => t('auth.no-invite'),
  cancelled: () => t('auth.cancelled'),
  'no-account': () => t('auth.no-account'),
  unreachable: () => t('auth.pds-unreachable'),
  failed: () => t('auth.failed'),
  // Not a sign-in: the Account was just deleted (delete-account.ts).
  deleted: () => t('auth.account-deleted'),
  'deleted-shared-left': () => t('auth.account-deleted-shared-left'),
};

export function signInResultMessage(result: string | null): string | undefined {
  return result === null ? undefined : results[result]?.();
}

// The Invite of an Invite link (`/sign-in#invite=<token>`): the server keeps
// it in a cookie for the sign-in that follows. Gives what the screen tells.
export async function keepInvite(fetch: (input: string, init?: RequestInit) => Promise<Response>, invite: string): Promise<string> {
  try {
    const response = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ invite }),
      credentials: 'same-origin',
    });
    return response.ok ? t('signin.invite-kept') : t('auth.invite-used');
  } catch (error) {
    return errorMessage(error);
  }
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const postJson = (fetch: Fetch, url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });

// Asks the server to send a Sign-in Code (email-sign-in.ts). Gives the address
// as the server compares it, or what the screen tells. The server answers the
// same for every address: the screen never says whether an Account exists.
export async function askSignInCode(fetch: Fetch, input: string): Promise<{ email: string } | { message: string }> {
  const email = input.trim().toLowerCase();
  if (!email.includes('@')) return { message: t('auth.type-email') };
  try {
    const response = await postJson(fetch, '/api/sign-in/code', { email });
    if (response.ok) return { email };
    return { message: response.status === 429 ? t('auth.too-many') : t('auth.type-email') };
  } catch (error) {
    return { message: errorMessage(error) };
  }
}

// The 6 digits of a Sign-in Code in typed or copied text: 482913 or 482 913,
// never part of a longer number.
export function codeIn(text: string): string | undefined {
  return /(?<!\d)\d{3}\s?\d{3}(?!\d)/.exec(text)?.[0].replace(/\s/, '');
}

// Sends the code the reader typed or pasted (digits only). Undefined when the
// browser is signed in; else what the screen tells.
export async function signInWithCode(fetch: Fetch, email: string, input: string): Promise<string | undefined> {
  const code = input.replace(/\D/g, '');
  if (code.length !== 6) return t('auth.type-code');
  try {
    const response = await postJson(fetch, '/api/sign-in/check', { email, code });
    if (response.ok) return undefined;
    if (response.status === 403) return t('auth.no-invite');
    if (response.status === 429) return t('auth.too-many');
    return response.status === 400 ? t('auth.wrong-code') : t('auth.failed');
  } catch (error) {
    return errorMessage(error);
  }
}

export function errorMessage(error: unknown): string {
  if (isNetworkFailure(error)) return t('error.server-unreachable');
  return t('auth.failed');
}
