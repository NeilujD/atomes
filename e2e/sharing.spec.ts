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

// A reader who may share: /api/sharing is stubbed on the dev server, since
// /dev/sign-in-as opens no OAuth session. Checks the native confirm dialog
// (focus, Escape) that happy-dom cannot.
test('Sharing the first category asks first: Escape and Cancel keep it Private, Share shares it', async ({ page, signIn }) => {
  let shared = false;
  let puts = 0;
  await page.route('**/api/sharing**', async (route) => {
    if (route.request().method() === 'PUT') {
      puts += 1;
      shared = (route.request().postDataJSON() as { shared: boolean }).shared;
    }
    await route.fulfill({
      json: { shared: { readingStatuses: shared, follows: false, labels: false }, privateWorks: [], pending: false, canShare: true, atproto: true },
    });
  });
  await signIn();
  await page.goto('/settings');
  const statuses = page.getByRole('region', { name: 'Sharing' }).getByRole('switch', { name: 'Reading Statuses' });
  const dialog = page.getByRole('dialog', { name: 'Share Reading Statuses?' });

  await statuses.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(statuses).not.toBeChecked();

  await statuses.click();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(statuses).not.toBeChecked();
  expect(puts).toBe(0);

  await statuses.click();
  await dialog.getByRole('button', { name: 'Share' }).click();
  await expect(statuses).toBeChecked();
  expect(puts).toBe(1);
});
