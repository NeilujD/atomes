import { expect, test } from './test';

// Search by an Author (ADR 0021, CORE-188) on the recorded Catalog: the Author
// row opens their Works, 20 at a time, newest first; a Work opens its Editions.

test('Search → "Agatha Christie" → Author row → 20 Works → Show more → a Work → its Editions', async ({ page, signIn }) => {
  await signIn();
  await page.goto('/check?mode=search');
  await page.getByLabel('Title or author').fill('Agatha Christie');
  await page.getByRole('button', { name: 'Search', exact: true }).click();

  // Two other Inventaire Authors have her name and no birth year: hers shows.
  await page.getByRole('button', { name: 'Agatha Christie (1890) · 385 Works' }).click();
  await expect(page.getByRole('heading', { name: 'Agatha Christie' })).toBeVisible();
  const works = page.getByRole('list', { name: 'Works' }).getByRole('listitem');
  await expect(works).toHaveCount(20);
  await expect(works.first()).toContainText('And Then There Were None');
  await expect(works.first()).toContainText('2025');

  await page.getByRole('button', { name: 'Show more' }).click();
  await expect(works).toHaveCount(40);

  await works.first().getByRole('button').click();
  await expect(page.getByRole('heading', { name: 'And Then There Were None' })).toBeVisible();
  // A Work of an Author page matched no words: the Preferred Language only (CORE-186).
  await expect(page.getByRole('list', { name: 'English', exact: true }).getByRole('listitem').first()).toBeVisible();

  // Back goes to the Author, with the Works shown so far.
  await page.getByRole('button', { name: 'Agatha Christie', exact: true }).click();
  await expect(works).toHaveCount(40);
});
