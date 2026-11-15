import { expect, quickAdd, test } from './test';

// The Catalog is shared by every journey on the server: each browser corrects
// its own recorded book with no Series, so the two runs never meet.
const books = {
  chromium: { isbn: '9782265144026', title: 'Réglez-lui son compte !' },
  webkit: { isbn: '9780000000002', title: 'Granites and basalts' },
};

test('Series Correction: a New Series for a book with none, seen in the Library Series mode, then Back to the sources', async ({ page, signIn }, testInfo) => {
  const book = books[testInfo.project.name as keyof typeof books];
  const series = `Correction ${testInfo.project.name}`;
  await signIn();
  await quickAdd(page, book.isbn);
  await expect(page.getByText(/is in your Library/)).toBeVisible();
  await page.getByRole('link', { name: 'Open its Book page' }).click();
  await expect(page).toHaveURL(/\/book/);

  await page.getByRole('button', { name: 'Add to a Series' }).click();
  const sheet = page.getByRole('dialog', { name: 'Series Correction' });
  await sheet.getByRole('button', { name: 'New Series' }).click();
  await sheet.getByLabel('Title of the Series').fill(series);
  await sheet.getByLabel('Volume number').fill('3');
  await sheet.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Series corrected. Every reader sees it.')).toBeVisible();
  await expect(page.getByRole('link', { name: series })).toBeVisible();
  await expect(page.getByText(/· Volume 3 ·/)).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' }).click();
  await page.getByRole('radio', { name: 'Series' }).check();
  await expect(page.getByRole('link', { name: new RegExp(series) })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/book/);
  await page.getByRole('button', { name: 'Change the Series of this book' }).click();
  await sheet.getByRole('button', { name: 'Back to the sources' }).click();
  await expect(page.getByText('Back to what the sources say.')).toBeVisible();
  await expect(page.getByRole('link', { name: series })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add to a Series' })).toBeVisible();
});
