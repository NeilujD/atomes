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
  if (!handle) return { status: 'signed-out', message: 'Type your handle, for example alice.bsky.social.' };
  try {
    await client.signIn(handle);
    return { status: 'signed-out' };
  } catch (error) {
    return { status: 'signed-out', message: errorMessage(error) };
  }
}

// Clears what the device keeps for the reader first (device-data.ts), so it
// goes even when the PDS cannot be reached.
export async function signOut(
  client: AuthClient,
  account: Account,
  device: Pick<LocalCopy, 'clear'>,
): Promise<AuthState> {
  await device.clear();
  try {
    await client.signOut(account.did);
    return { status: 'signed-out' };
  } catch {
    // The client deletes the local session even when the PDS cannot be reached.
    return {
      status: 'signed-out',
      message: 'Signed out on this device. Your PDS could not be reached to end the session there.',
    };
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof OAuthCallbackError) {
    if (error.params.get('error') === 'access_denied') return 'Sign-in was cancelled.';
    return `Your PDS refused the sign-in: ${error.message}`;
  }
  // The reader came back from the PDS page with the Back button.
  if (error instanceof Error && error.message === 'User navigated back') return 'Sign-in was cancelled.';
  if (error instanceof OAuthResponseError) {
    return `Your PDS refused the sign-in: ${error.errorDescription ?? error.error ?? `HTTP ${error.status}`}`;
  }
  if (error instanceof TokenRefreshError || error instanceof TokenRevokedError || error instanceof TokenInvalidError) {
    return 'Your session has ended. Sign in again.';
  }
  if (error instanceof ClientMetadataError) {
    return error.reachable
      ? 'This Atomes server is not set up for sign-in. Its owner must set PUBLIC_APP_ORIGIN to its https origin.'
      : 'Could not reach this Atomes server. Check your connection and try again.';
  }
  if (isNetworkFailure(error)) return 'Could not reach your PDS. Check your connection and try again.';
  if (error instanceof OAuthResolverError || error instanceof HandleResolverError) {
    return 'No account found for this handle. Check the spelling.';
  }
  return 'Sign-in failed. Try again.';
}
