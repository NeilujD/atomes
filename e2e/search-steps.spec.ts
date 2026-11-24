import { expect, test } from './test';

// The steps of Search (CORE-192) on the recorded Catalog, with slow answers:
// one request at a time, the current step stays until the next is ready, and
// the browser Back goes up one step, not out of Check a book.

test.beforeEach(async ({ page }) => {
  // Each Search answer comes late, so the test sees the step while it loads.
  await page.route('**/api/catalog/find**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.continue();
  });
});

test('Author → a Work → browser Back → the Author’s Works → Back → the results, the words still in the field', async ({ page, signIn }) => {
  await signIn();
  await page.goto('/check?mode=search');
  await page.getByLabel('Title or author').fill('Agatha Christie');
  await page.getByRole('button', { name: 'Search', exact: true }).click();

  const author = page.getByRole('button', { name: 'Agatha Christie (1890) · 385 Works' });
  await author.click();
  // While it loads: the tapped row says so, the others and Search take no tap, the results stay.
  await expect(author).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Agatha Christie' })).toBeHidden();

  const works = page.getByRole('list', { name: 'Works' }).getByRole('listitem');
  await expect(works).toHaveCount(20);
  await works.first().getByRole('button').click();
  await expect(page.getByRole('heading', { name: 'And Then There Were None' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agatha Christie', exact: true })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Agatha Christie' })).toBeVisible();
  await expect(works).toHaveCount(20);
  await expect(page).toHaveURL(/\/check\?mode=search&q=Agatha\+Christie$/);

  await page.goBack();
  await expect(author).toBeVisible();
  await expect(page.getByLabel('Title or author')).toHaveValue('Agatha Christie');
  await expect(page).toHaveURL(/\/check\?mode=search&q=Agatha\+Christie$/);
});

test('the browser Back closes the Shelf Check answer onto its Editions, then goes back to the results', async ({ page, signIn }) => {
  await signIn();
  await page.goto('/check?mode=search');
  await page.getByLabel('Title or author').fill('Dix petits nègres');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: /^Dix Petits Nègres Agatha Christie · 1939/ }).click();

  const edition = page.getByRole('button', { name: /ISBN 9782253241782/ });
  await edition.click();
  const answer = page.getByRole('dialog', { name: 'Shelf Check' });
  await expect(answer.getByText('Not in your Library', { exact: true })).toBeVisible();

  await page.goBack();
  await expect(answer).toBeHidden();
  await expect(edition).toBeVisible();

  await page.goBack();
  await expect(page.getByRole('button', { name: /^Dix Petits Nègres Agatha Christie · 1939/ })).toBeVisible();
  await expect(page.getByLabel('Title or author')).toHaveValue('Dix petits nègres');
});
