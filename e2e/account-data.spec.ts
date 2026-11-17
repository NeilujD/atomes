// The privacy notice, the export and the delete of an Account (CORE-55).
import { readFile } from 'node:fs/promises';
import { expect, quickAdd, test } from './test';

test('A signed-out visitor reads the privacy notice from the sign-in screen, in English and in French', async ({ page, baseURL }) => {
  await page.goto('/sign-in');
  await page.getByRole('link', { name: 'Privacy notice' }).click();

  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole('heading', { name: 'Privacy notice', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Take it with you, or delete it' })).toBeVisible();
  // No gate sends the visitor away once the page scripts have run.
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/\/privacy$/);

  // The language chosen in Settings, or the browser's (src/lib/i18n).
  await page.context().addCookies([{ name: 'atomes-language', value: 'fr', url: baseURL! }]);
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Politique de confidentialité', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'L’emporter, ou l’effacer' })).toBeVisible();
});

test('Closing the privacy notice goes back to the screen that opened it', async ({ page, signIn }) => {
  await signIn();
  await page.goto('/settings');
  await page.getByRole('link', { name: 'Privacy notice' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await page.getByRole('link', { name: 'Close' }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test('The reader exports the Library, deletes the account, and signs in again to an empty Library', async ({ page, signIn }) => {
  await signIn();
  await quickAdd(page, '9782723478991');
  await page.getByRole('link', { name: 'Skip' }).click();
  await expect(page).toHaveURL(/\/book/);
  // The Copy reached the server (the device sends its write queue there).
  const copies = async () => ((await (await page.request.get('/api/account/export')).json()) as { records: Record<string, unknown[]> }).records['app.atomes.copy'];
  await expect.poll(async () => (await copies()).length).toBe(1);

  await page.goto('/settings');
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Export my Library' }).click();
  const file = await (await download).path();
  const exported = JSON.parse(await readFile(file, 'utf8')) as { records: Record<string, unknown[]> };
  expect(exported.records['app.atomes.copy']).toHaveLength(1);
  expect(Object.keys(exported.records)).toContain('app.atomes.loan');

  // Cancel keeps everything.
  const confirm = page.getByRole('dialog', { name: 'Delete your account?' });
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toBeHidden();

  await page.getByRole('button', { name: 'Delete my account' }).click();
  await confirm.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole('alert')).toHaveText('Your account is deleted.');

  // The session is over on the server too.
  await page.goto('/library');
  await expect(page).toHaveURL(/\/sign-in/);

  // The same AT Protocol account signs in to a new, empty Account.
  await signIn();
  expect(await copies()).toEqual([]);
});
