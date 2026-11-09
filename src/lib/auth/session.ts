// The reader's sign-in state on the device, over a small port so tests can use
// a fake client. The server holds the OAuth session (ADR 0013): the device
// never holds, logs or sends a token, only the session cookie the browser keeps.
import { t } from '../i18n/i18n';
import { isNetworkFailure } from '../network';
import type { LocalCopy } from '../space/local-copy';

export interface Account {
  did: string;
  handle: string;
}

export interface AuthClient {
  // Who is signed in. With the server out of reach: the account this device saw last.
  init(): Promise<Account | undefined>;
  // Sends the window to the server, which sends it to the PDS sign-in page.
  signIn(handle: string): Promise<void>;
  // Ends the session on the server and removes the cookie.
  signOut(did: string): Promise<void>;
}

export type AuthState = { status: 'signed-out'; message?: string } | { status: 'signed-in'; account: Account };

export async function loadSession(client: AuthClient): Promise<AuthState> {
  try {
    const account = await client.init();
    return account ? { status: 'signed-in', account } : { status: 'signed-out' };
  } catch (error) {
    return { status: 'signed-out', message: errorMessage(error) };
  }
}

// Resolves only when the sign-in does not leave the page.
export async function signIn(client: AuthClient, input: string): Promise<AuthState> {
  const handle = input.trim().replace(/^@/, '');
  if (!handle) return { status: 'signed-out', message: t('auth.type-handle') };
  try {
    await client.signIn(handle);
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

// What the server tells after a sign-in, as `?auth=` on the Settings page
// (SignInResult in src/lib/server/auth.ts). Undefined for a success or an unknown value.
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
