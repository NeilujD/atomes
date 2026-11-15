import type { Page } from '@playwright/test';
import { expect, quickAdd, test } from './test';

// A Work read whose only Copy is removed stays in the Library, told apart from
// the owned ones (CORE-100): a grey cover and "Not owned" in Grid, List and
// Cover flow, and the "Not owned" filter lists only it.

// Leave a Book page only once its islands have loaded: an island whose load
// the navigation stops is an unhandled rejection in WebKit.
const islandsLoaded = (page: Page) => expect(page.locator('astro-island[ssr]')).toHaveCount(0);

test('read, then its only Copy removed: the Work shows as not owned in every mode, and the "Not owned" filter finds it', async ({ page, signIn }) => {
  test.slow();
  await signIn();
  // One Piece 56, Glénat: read, then its Copy removed.
  await quickAdd(page, '9782723478991');
  await page.getByRole('link', { name: 'Skip' }).click();
  await expect(page).toHaveURL(/\/book/);
  await islandsLoaded(page);
  await page.getByRole('combobox', { name: 'Reading Status' }).selectOption({ label: 'Read' });
  await expect(page.getByText('Saved to your Library.')).toBeVisible();
  await page.getByRole('button', { name: 'Remove the Copy with ISBN 9782723478991' }).click();
  await expect(page.getByRole('button', { name: 'Remove the Copy with ISBN 9782723478991' })).toHaveCount(0);
  // La Horde du Contrevent: owned, a standalone novel, so no Series Onboarding.
  await quickAdd(page, '9782072927515');
  await expect(page.getByText(/is in your Library/)).toBeVisible();

  await page.goto('/library');
  await expect(page.getByText('2 books', { exact: true })).toBeVisible();
  const books = page.getByRole('main').getByRole('list');
  const onePiece = books.getByRole('link', { name: /One Piece/ });
  const horde = books.getByRole('link', { name: /La Horde du Contrevent/ });
  await expect(onePiece).toContainText('Not owned');
  await expect(horde).not.toContainText('Not owned');
  const grey = (link: typeof onePiece) => link.locator('.book-cover').evaluate((cover) => getComputedStyle(cover).filter);
  expect([await grey(onePiece), await grey(horde)]).toEqual(['grayscale(1)', 'none']);

  await page.getByRole('radio', { name: 'List' }).check();
  await expect(page.getByRole('main').getByRole('link', { name: /One Piece/ })).toContainText('Not owned');
  await expect(page.getByRole('main').getByRole('link', { name: /La Horde du Contrevent/ })).not.toContainText('Not owned');

  await page.getByRole('radio', { name: 'Cover flow' }).check();
  await expect(page.getByRole('link', { name: 'One Piece, Volume 56, Not owned' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'La Horde du Contrevent', exact: true }).first()).toBeAttached();

  await page.getByRole('radio', { name: 'Grid' }).check();
  await page.getByRole('button', { name: 'Sort and filter' }).click();
  await page.getByRole('button', { name: /^Not owned/ }).click();
  await page.getByRole('button', { name: 'Show 1 book' }).click();
  await expect(page.getByText('1 of 2 books', { exact: true })).toBeVisible();
  await expect(books.getByRole('link')).toHaveCount(1);
  await expect(onePiece).toBeVisible();
});
