import { expect, quickAdd, test } from './test';

// The page transitions (src/lib/page-transition.ts) never break a navigation.
// What the reader sees is checked by hand: no visual assertion here.
test('Library to a Book and back: the cover flies, and each page opens with no error', async ({ page, signIn }) => {
  const errors: string[] = [];
  // WebKit logs a fetch that a navigation stops as an error, even when the page
  // handles it, and Playwright gives that log as a page error: not counted.
  page.on('pageerror', (error) => {
    if (!error.message.endsWith(' due to access control checks.')) errors.push(error.message);
  });
  // Leave a Book page only once its islands have loaded: an island whose load
  // the navigation stops is an unhandled rejection in WebKit.
  const islandsLoaded = () => expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await signIn();
  // One Piece 56, Glénat: a recorded Catalog answer.
  await quickAdd(page, '9782723478991');
  await page.getByRole('link', { name: 'Skip' }).click();
  await expect(page).toHaveURL(/\/book/);
  await islandsLoaded();

  await page.goto('/library');
  const book = page.getByRole('link', { name: /^One Piece Volume 56/ });
  await book.click();
  await expect(page).toHaveURL(/\/book\?work=/);
  await expect(page.getByRole('heading', { name: 'Reading Status' })).toBeVisible();
  await islandsLoaded();

  await page.goBack();
  await expect(page).toHaveURL(/\/library$/);
  await expect(book).toBeVisible();
  // The cover of the Library is shown again once the flight home ends.
  await expect(book.locator('.book-cover')).toHaveCSS('visibility', 'visible');
  expect(errors).toEqual([]);
});
