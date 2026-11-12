import { expect, quickAdd, test } from './test';

test('Quick Add a known ISBN, then find the book in the Library', async ({ page, signIn }) => {
  await signIn();
  // One Piece 56, Glénat: a recorded Catalog answer.
  await quickAdd(page, '9782723478991');

  // Its Series is new to the reader: Series Onboarding asks first. Skip opens the Book page.
  await expect(page.getByRole('heading', { name: /Which Volumes of One Piece/ })).toBeVisible();
  await page.getByRole('link', { name: 'Skip' }).click();
  await expect(page).toHaveURL(/\/book/);

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' }).click();
  await page.getByLabel('Search your Library').fill('One Piece');
  await expect(page.getByRole('link', { name: /^One Piece Volume 56/ })).toBeVisible();
});
