import { expect, test } from './test';

// /dev/sign-in-as opens no OAuth session, so the server may not write to any
// PDS: Settings gives the reason for the permission, and nothing can be Shared.
// The share and unshare on a real PDS are checked by hand (CORE-38).
test('Sharing in Settings: all Private, and sharing asks to sign in again first', async ({ page, signIn }) => {
  await signIn();
  await page.goto('/settings');
  const sharing = page.getByRole('region', { name: 'Sharing' });

  await expect(sharing.getByText('Copies, Loans and To Buy are never Shared.', { exact: false })).toBeVisible();
  for (const name of ['Reading Statuses', 'Followed Series', 'Labels']) {
    const toggle = sharing.getByRole('switch', { name });
    await expect(toggle).not.toBeChecked();
    await expect(toggle).toBeDisabled();
  }
  await expect(sharing.getByText('Atomes needs permission to write on your AT Protocol account', { exact: false })).toBeVisible();
  await expect(sharing.getByRole('button', { name: 'Sign in again' })).toBeVisible();
});
