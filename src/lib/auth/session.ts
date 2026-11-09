// The reader's sign-in state, over a small port so tests can use a fake client.
// The real client (browser-client.ts) keeps tokens and the DPoP key in
// IndexedDB; nothing here ever holds, logs or sends a token.
import {
  HandleResolverError,
  OAuthCallbackError,
  OAuthResolverError,
  OAuthResponseError,
  TokenInvalidError,
  TokenRefreshError,
  TokenRevokedError,
} from '@atproto/oauth-client-browser';
import { t } from '../i18n/i18n';
import { isNetworkFailure } from '../network';
import type { LocalCopy } from '../space/local-copy';
import { ClientMetadataError } from './client-metadata';

export interface Account {
  did: string;
  handle: string;
}

export interface AuthClient {
  // Finishes a sign-in that comes back from the PDS, or restores the stored session.
  init(): Promise<Account | undefined>;
  // Sends the window to the PDS sign-in page. Rejects if the reader comes back without signing in.
  signIn(handle: string): Promise<void>;
  // Deletes the session on this device, and revokes it on the PDS when it can.
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
// goes even when the PDS cannot be reached. The session ends even when that
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
  // The client deletes the local session even when the PDS cannot be reached.
  const revoked = await client.signOut(account.did).then(
    () => true,
    () => false,
  );
  // Data left on the device matters more than a session left on the PDS.
  if (!cleared) return { status: 'signed-out', message: t('auth.signed-out-data-left') };
  if (!revoked) return { status: 'signed-out', message: t('auth.signed-out-pds-unreached') };
  return { status: 'signed-out' };
}

export function errorMessage(error: unknown): string {
  if (error instanceof OAuthCallbackError) {
    if (error.params.get('error') === 'access_denied') return t('auth.cancelled');
    return t('auth.pds-refused', error.message);
  }
  // The reader came back from the PDS page with the Back button.
  if (error instanceof Error && error.message === 'User navigated back') return t('auth.cancelled');
  if (error instanceof OAuthResponseError) {
    return t('auth.pds-refused', error.errorDescription ?? error.error ?? `HTTP ${error.status}`);
  }
  if (error instanceof TokenRefreshError || error instanceof TokenRevokedError || error instanceof TokenInvalidError) {
    return t('auth.session-ended');
  }
  if (error instanceof ClientMetadataError) {
    return t(error.reachable ? 'auth.server-not-set-up' : 'error.server-unreachable');
  }
  if (isNetworkFailure(error)) return t('error.pds-unreachable');
  if (error instanceof OAuthResolverError || error instanceof HandleResolverError) {
    return t('auth.no-account');
  }
  return t('auth.failed');
}
