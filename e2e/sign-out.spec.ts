import { expect, test } from './test';

test('Sign-out asks for confirmation, then the reader is signed out', async ({ page, signIn }) => {
  await signIn();
  await page.goto('/settings');
  const confirm = page.getByRole('dialog', { name: 'Sign out of this device?' });

  // Cancel keeps the reader signed in.
  await page.getByRole('main').getByRole('button', { name: 'Sign out' }).click();
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByText('Signed in as @test.reader')).toBeVisible();

  await page.getByRole('main').getByRole('button', { name: 'Sign out' }).click();
  await confirm.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in/);

  // The session is over on the server too, not only on this screen.
  await page.goto('/library');
  await expect(page).toHaveURL(/\/sign-in/);
});
