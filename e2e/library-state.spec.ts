import type { Locator, Page } from '@playwright/test';
import { expect, quickAdd, test } from './test';

// Back from a Book, the Library is as the reader left it (CORE-96): search,
// filters, scroll and the Cover flow position, with the back arrow of the Book
// page and with the browser Back button.

// Leave a Book page only once its islands have loaded: an island whose load
// the navigation stops is an unhandled rejection in WebKit.
const islandsLoaded = (page: Page) => expect(page.locator('astro-island[ssr]')).toHaveCount(0);

// Opens a Book from the Library, then goes back one way or the other.
async function toBookAndBack(page: Page, book: Locator, back: 'arrow' | 'browser') {
  await book.click();
  await expect(page).toHaveURL(/\/book\?work=/);
  await expect(page.getByRole('heading', { name: 'Reading Status' })).toBeVisible();
  await islandsLoaded(page);
  if (back === 'arrow') await page.getByRole('link', { name: 'Back' }).click();
  else await page.goBack();
  await expect(page).toHaveURL(/\/library$/);
}

test('back from a Book, the Library keeps its search, filter, scroll and Cover flow position', async ({ page, signIn }) => {
  test.slow();
  await signIn();
  // Spy x Family 16, Kurokawa: Series Onboarding adds Volumes 1 to 16 once the
  // reader answers that they own Volumes 1 to 15.
  await quickAdd(page, '9791042021030');
  await page.getByRole('button', { name: 'Yes' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/series/);
  await islandsLoaded(page);
  // One Piece 56, Glénat: a book the search leaves out.
  await quickAdd(page, '9782723478991');
  await page.getByRole('link', { name: 'Skip' }).click();
  await expect(page).toHaveURL(/\/book/);
  await islandsLoaded(page);

  await page.goto('/library');
  const books = page.getByRole('main').getByRole('list').getByRole('link');
  await expect(books).toHaveCount(17);
  await page.getByRole('searchbox', { name: 'Search your Library' }).fill('spy');
  await page.getByRole('button', { name: 'Sort and filter' }).click();
  await page.getByRole('button', { name: /^Not yet/ }).click();
  await page.getByRole('button', { name: 'Show 16 books' }).click();
  // Down the grid, then the book in the middle of the screen, clear of the tab bar.
  await page.evaluate(() => scrollTo(0, 600));
  const middle = await books.evaluateAll((links) => links.findIndex((link) => link.contains(document.elementFromPoint(innerWidth / 2, innerHeight / 2))));
  const book = books.nth(middle);
  const scrolled = await page.evaluate(() => Math.round(scrollY));
  expect([middle > 0, scrolled]).toEqual([true, 600]);

  const asLeft = async () => {
    await expect(page.getByRole('searchbox', { name: 'Search your Library' })).toHaveValue('spy');
    await expect(page.getByText('16 of 17 books', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /1 filter on/ })).toBeVisible();
    await expect.poll(() => page.evaluate(() => Math.round(scrollY))).toBe(scrolled);
  };
  await toBookAndBack(page, book, 'arrow');
  await asLeft();
  await toBookAndBack(page, book, 'browser');
  await asLeft();

  // Cover flow, moved to book 12.
  await page.getByRole('combobox', { name: 'View' }).selectOption('Cover flow');
  await page.getByRole('slider', { name: 'Browse your Library' }).fill('12');
  await expect(page.getByText('12 of 16', { exact: true })).toBeVisible();
  const front = page.locator('.library-flow-cover[aria-current="true"]');

  await toBookAndBack(page, front, 'arrow');
  await expect(page.getByText('12 of 16', { exact: true })).toBeVisible();
  await toBookAndBack(page, front, 'browser');
  await expect(page.getByText('12 of 16', { exact: true })).toBeVisible();

  // From a Book, the Library tab opens a clean Library.
  await front.click();
  await expect(page).toHaveURL(/\/book\?work=/);
  await islandsLoaded(page);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole('searchbox', { name: 'Search your Library' })).toHaveValue('');
  // No filter on, so no count (CORE-110); the Cover flow is over all 17 books.
  await expect(page.getByRole('button', { name: 'Sort and filter', exact: true })).toBeVisible();
  await expect(page.getByText('17 books', { exact: true })).toHaveCount(0);
  await expect(page.getByText('9 of 17', { exact: true })).toBeVisible();

  // A Book opened in a new tab, as from a bookmark: the back arrow opens the Library.
  const tab = await page.context().newPage();
  await tab.goto((await front.getAttribute('href'))!);
  await expect(tab.getByRole('heading', { name: 'Reading Status' })).toBeVisible();
  await islandsLoaded(tab);
  await tab.getByRole('link', { name: 'Back' }).click();
  await expect(tab).toHaveURL(/\/library$/);
});
