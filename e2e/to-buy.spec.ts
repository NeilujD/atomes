import { expect, quickAdd, test } from './test';

test('To Buy lists a Missing Volume of a followed Series', async ({ page, signIn }) => {
  await signIn();
  // Spy x Family 16, Kurokawa: its whole Edition Line is recorded.
  await quickAdd(page, '9791042021030');

  // The reader owns every Volume but 3, and follows the Series (the switch is on).
  await expect(page.getByRole('heading', { name: /Which Volumes of Spy x Family/i })).toBeVisible();
  await page.getByRole('button', { name: /^Volume 3, owned/ }).click();
  await expect(page.getByRole('button', { name: /^Volume 3, missing/ })).toBeVisible();
  await expect(page.getByRole('switch', { name: /Tell me when a new Volume is out/ })).toBeChecked();
  await page.getByRole('button', { name: 'Save series' }).click();
  await expect(page).toHaveURL(/\/book/);

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'To Buy' }).click();
  const series = page.getByRole('button', { name: /^Spy x Family · 1 Volume \(3\)/i });
  await expect(series).toBeVisible();
  await series.click();
  await expect(page.getByText(/Spy x Family.*3/i).last()).toBeVisible();
});
