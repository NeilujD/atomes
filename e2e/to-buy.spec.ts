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

  // The "+" of the view header opens Check a book in Search mode. A book whose
  // ISBN the reader knows: Scan mode, the ISBN, then Add to To Buy on the
  // answer (One Piece 56), the main action from To Buy.
  await page.getByRole('link', { name: 'Add a book' }).click();
  await expect(page).toHaveURL(/\/check\?mode=search&from=to-buy$/);
  await expect(page.getByLabel('Title of the book')).toBeVisible();
  await page.getByRole('radio', { name: 'Scan' }).check();
  await page.getByLabel('ISBN', { exact: true }).fill('9782723478991');
  await page.getByRole('button', { name: 'Look up' }).click();
  const add = page.getByRole('dialog', { name: 'Shelf Check' }).getByRole('button', { name: 'Add to To Buy' });
  await expect(add).toHaveClass(/result-primary/);
  await add.click();
  await expect(page.getByRole('status').filter({ hasText: /on your To Buy list/ }).first()).toBeVisible();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'To Buy' }).click();
  await expect(page.getByRole('region', { name: 'Added by hand' }).getByRole('listitem').filter({ hasText: 'ISBN 9782723478991' })).toBeVisible();
});
