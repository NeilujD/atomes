import { expect, quickAdd, test } from './test';

test('Series Onboarding, then the Series page lists the Volumes', async ({ page, signIn }) => {
  await signIn();
  // Spy x Family 16, Kurokawa: its whole Edition Line is recorded.
  await quickAdd(page, '9791042021030');

  await expect(page.getByRole('heading', { name: /Which Volumes of Spy x Family/i })).toBeVisible();
  await page.getByRole('button', { name: 'Save series' }).click();

  // Saved: the Book page, whose Series name opens the Series page.
  await expect(page).toHaveURL(/\/book/);
  await page.getByRole('link', { name: /Spy x Family/i }).click();
  await expect(page).toHaveURL(/\/series\?isbn=9791042021030/);

  const volumes = page.getByRole('region', { name: 'Volumes' });
  await expect(volumes.getByRole('button', { name: 'Volume 1: owned, not read' })).toBeVisible();
  await expect(volumes.getByRole('button', { name: 'Volume 16: owned, not read' })).toBeVisible();
});
