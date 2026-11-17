// "Delete my account" in Settings (CORE-55): the server deletes the Account
// (src/lib/server/account-data.ts), then this device forgets it and its
// Library copy, as a sign-out does (device-data.ts). The sign-in screen then
// says the result, and whether Shared records are still on the PDS.
import { t } from '../i18n/i18n';
import { accountKey } from './gate-boot';
import { signInPath } from './return-to';

export interface DeleteAccountDeps {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  storage: Pick<Storage, 'removeItem'>;
  device: { clear(): Promise<void> };
}

// `next`: the page to go to. `message`: what Settings shows; nothing changed
// on the server, or, after the delete, data is left on this device.
export async function deleteAccount(deps: DeleteAccountDeps): Promise<{ next: string } | { message: string }> {
  let sharedLeft: boolean;
  try {
    const response = await deps.fetch('/api/account/delete', { method: 'POST', credentials: 'same-origin' });
    if (!response.ok) throw new Error(`HTTP ${response.status} for /api/account/delete`);
    ({ sharedLeft } = (await response.json()) as { sharedLeft: boolean });
  } catch {
    // Offline, or the server refused: nothing changed.
    return { message: t('settings.delete-failed') };
  }
  deps.storage.removeItem(accountKey);
  const cleared = await deps.device.clear().then(
    () => true,
    () => false,
  );
  if (!cleared) return { message: t('auth.signed-out-data-left') };
  return { next: `${signInPath}?auth=${sharedLeft ? 'deleted-shared-left' : 'deleted'}` };
}
