import { expect, quickAdd, test } from './test';

test('Home: one line to Check a book while the Library is empty, then the book just added under Owned, not read yet', async ({ page, signIn }) => {
  await signIn();
  await page.goto('/');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Type an ISBN' })).toHaveCount(0);

  // La Horde du Contrevent: a recorded standalone novel, so no Series Onboarding.
  await quickAdd(page, '9782072927515');
  await expect(page.getByText(/is in your Library/)).toBeVisible();

  await page.goto('/');
  const section = page.getByRole('region', { name: 'Owned, not read yet' });
  await expect(section.getByRole('link', { name: /La Horde du Contrevent/i })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Reading now' })).toHaveCount(0);
  await section.getByRole('link', { name: /La Horde du Contrevent/i }).click();
  await expect(page).toHaveURL(/\/book/);
});
