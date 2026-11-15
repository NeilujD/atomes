import { expect, quickAdd, test } from './test';

test('To Buy lists a Missing Volume of a followed Series', async ({ page, signIn }) => {
  await signIn();
  // Spy x Family 16, Kurokawa: its whole Edition Line is recorded.
  await quickAdd(page, '9791042021030');

  // The reader owns every Volume but 3, and follows the Series (the switch is on).
  await expect(page.getByRole('heading', { name: /Which Volumes of Spy x Family/i })).toBeVisible();
  await page.getByRole('button', { name: 'Yes' }).click();
  await page.getByRole('button', { name: /^Volume 3, owned/ }).click();
  await expect(page.getByRole('button', { name: /^Volume 3, missing/ })).toBeVisible();
  await expect(page.getByRole('switch', { name: /Tell me when a new Volume is out/ })).toBeChecked();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/series/);

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'To Buy' }).click();
  const series = page.getByRole('button', { name: /^Spy x Family · 1 Volume \(3\)/i });
  await expect(series).toBeVisible();
  await series.click();
  await expect(page.getByText(/Spy x Family.*3/i).last()).toBeVisible();

  // The "+" of the view header opens the sheet that adds a book by its ISBN (One Piece 56).
  await page.getByRole('button', { name: 'Add a book' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add a book by its ISBN' });
  await sheet.getByLabel('Add a book by its ISBN').fill('9782723478991');
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('region', { name: 'Added by hand' }).getByText(/One Piece/).first()).toBeVisible();
});
