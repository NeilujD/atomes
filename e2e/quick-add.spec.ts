import { expect, quickAdd, test } from './test';

test('Quick Add a known ISBN, then find the book in the Library', async ({ page, signIn }) => {
  await signIn();
  // One Piece 56, Glénat: a recorded Catalog answer.
  await quickAdd(page, '9782723478991');

  // Its Series is new to the reader: Series Onboarding asks first. Skip opens the Book page.
  await expect(page.getByRole('heading', { name: /Which Volumes of One Piece/ })).toBeVisible();
  await page.getByRole('link', { name: 'Skip' }).click();
  await expect(page).toHaveURL(/\/book/);

  // Skip means "not now": a second Copy of the same Series does not ask again.
  await page.goto('/check');
  await page.getByLabel('ISBN', { exact: true }).fill('9782723478991');
  await page.getByRole('button', { name: 'Look up' }).click();
  await page.getByRole('button', { name: 'Add another Copy' }).click();
  await expect(page).toHaveURL(/\/book/);

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' }).click();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByLabel('Search your Library').fill('One Piece');
  await expect(page.getByRole('link', { name: /^One Piece Volume 56/ })).toBeVisible();
});
