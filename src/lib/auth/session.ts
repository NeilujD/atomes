// The reader's sign-in state on the device, over a small port so tests can use
// a fake client. The server holds the OAuth session (ADR 0013): the device
// never holds, logs or sends a token, only the session cookie the browser keeps.
import { t } from '../i18n/i18n';
import { isNetworkFailure } from '../network';
import type { LocalCopy } from '../space/local-copy';
import { signInHref } from './return-to';

export interface Account {
  did: string;
  handle: string;
}

export interface AuthClient {
  // Who is signed in. With the server out of reach: the account this device saw last.
  init(): Promise<Account | undefined>;
  // Sends the window to the server, which sends it to the PDS sign-in page.
  // After the sign-in, the server sends it to `returnTo`.
  signIn(handle: string, returnTo: string): Promise<void>;
  // Ends the session on the server and removes the cookie.
  signOut(did: string): Promise<void>;
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
): Promise<AuthState> {
  const cleared = await device.clear().then(
    () => true,
    () => false,
  );
  const ended = await client.signOut(account.did).then(
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
  'not-allowed': () => t('auth.not-allowed'),
  cancelled: () => t('auth.cancelled'),
  'no-account': () => t('auth.no-account'),
  unreachable: () => t('auth.pds-unreachable'),
  failed: () => t('auth.failed'),
};

export function signInResultMessage(result: string | null): string | undefined {
  return result === null ? undefined : results[result]?.();
}

export function errorMessage(error: unknown): string {
  if (isNetworkFailure(error)) return t('error.server-unreachable');
  return t('auth.failed');
}
