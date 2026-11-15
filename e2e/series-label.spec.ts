import type { Page } from '@playwright/test';
import { expect, quickAdd, test } from './test';

// A Label on a Series (CORE-104): put on One Piece from its Series page, it
// goes on every One Piece Work in the Library filter, also a Volume added
// after it, and the Book page shows it with a Series mark and no Remove.

// Leave a page only once its islands have loaded: an island whose load the
// navigation stops is an unhandled rejection in WebKit.
const islandsLoaded = (page: Page) => expect(page.locator('astro-island[ssr]')).toHaveCount(0);

test('a Label put on One Piece from its Series page goes on every One Piece Work, also a Volume added later', async ({ page, signIn }) => {
  test.slow();
  await signIn();
  // One Piece 56, Glénat (Series wd:Q673), then its Series page.
  await quickAdd(page, '9782723478991');
  await page.getByRole('link', { name: 'Skip' }).click();
  await expect(page).toHaveURL(/\/book/);
  await islandsLoaded(page);
  await page.getByRole('main').getByRole('link', { name: 'One Piece', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'One Piece', level: 1 })).toBeVisible();

  await page.getByRole('button', { name: 'Label', exact: true }).click();
  await page.getByRole('textbox', { name: 'New Label for the Series' }).fill('Shōnen');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove the Label Shōnen from this Series' })).toBeVisible();
  await islandsLoaded(page);

  // La Horde du Contrevent: a standalone novel, not in the Series. One Piece 112: a Volume added after the Label.
  await quickAdd(page, '9782072927515');
  await expect(page.getByText(/is in your Library/)).toBeVisible();
  // One Piece has a follow record since Series Onboarding was skipped: this Volume goes straight to its Book page.
  await quickAdd(page, '9782344068922');
  await expect(page).toHaveURL(/\/book/);
  await islandsLoaded(page);

  await page.goto('/library');
  await expect(page.getByText('3 books', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sort and filter' }).click();
  await page.getByRole('button', { name: /^Shōnen/ }).click();
  await page.getByRole('button', { name: 'Show 2 books' }).click();
  await expect(page.getByText('2 of 3 books', { exact: true })).toBeVisible();
  const books = page.getByRole('main').getByRole('list').getByRole('link');
  await expect(books).toHaveCount(2);
  await expect(books.filter({ hasText: /One Piece/ })).toHaveCount(2);

  // The Book page: the Label from the Series, with its mark and no Remove.
  await books.filter({ hasText: '56' }).click();
  await expect(page).toHaveURL(/\/book/);
  const chip = page.getByRole('listitem').filter({ hasText: 'Shōnen' });
  await expect(chip).toContainText('From the Series');
  await expect(page.getByRole('button', { name: /Remove the Label Shōnen/ })).toHaveCount(0);
  await expect(page.getByText('Labels from the Series are removed on the Series page.')).toBeVisible();
  await islandsLoaded(page);
});
