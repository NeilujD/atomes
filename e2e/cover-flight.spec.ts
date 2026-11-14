import { expect, quickAdd, test } from './test';

// The page transitions (src/lib/page-transition.ts) never break a navigation.
// What the reader sees is checked by hand: no visual assertion here.
test('Library to a Book and back: the cover flies, and each page opens with no error', async ({ page, signIn }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signIn();
  // One Piece 56, Glénat: a recorded Catalog answer.
  await quickAdd(page, '9782723478991');
  await page.getByRole('link', { name: 'Skip' }).click();
  await expect(page).toHaveURL(/\/book/);

  await page.goto('/library');
  const book = page.getByRole('link', { name: /^One Piece Volume 56/ });
  await book.click();
  await expect(page).toHaveURL(/\/book\?work=/);
  await expect(page.getByRole('heading', { name: 'Reading Status' })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/library$/);
  await expect(book).toBeVisible();
  // The cover of the Library is shown again once the flight home ends.
  await expect(book.locator('.book-cover')).toHaveCSS('visibility', 'visible');
  expect(errors).toEqual([]);
});
