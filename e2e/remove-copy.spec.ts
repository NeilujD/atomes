import type { Page } from '@playwright/test';
import { expect, quickAdd, test } from './test';

// The Book page keeps a Copy short (CORE-112): Lend opens its field from a
// tap, Remove waits behind the "…" menu, asks nothing, and its toast offers
// Undo, which brings the Copy back with its Loans.

// Leave a Book page only once its islands have loaded: an island whose load
// the navigation stops is an unhandled rejection in WebKit.
const islandsLoaded = (page: Page) => expect(page.locator('astro-island[ssr]')).toHaveCount(0);

const isbn = '9782723478991';

test('lend a Copy from a tap, remove it from its menu, then Undo: the Copy is back with its Loan', async ({ page, signIn }) => {
  test.slow();
  await signIn();
  // One Piece 56, Glénat.
  await quickAdd(page, isbn);
  await page.getByRole('link', { name: 'Skip' }).click();
  await expect(page).toHaveURL(/\/book/);
  await islandsLoaded(page);

  // Lend: the field opens from the Lend tap only.
  await expect(page.getByRole('textbox', { name: 'Lend to' })).toHaveCount(0);
  await page.getByRole('button', { name: `Lend the Copy with ISBN ${isbn}` }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('textbox', { name: 'Lend to' })).toHaveCount(0);
  await page.getByRole('button', { name: `Lend the Copy with ISBN ${isbn}` }).click();
  await page.getByRole('textbox', { name: 'Lend to' }).fill('Camille');
  await page.getByRole('button', { name: `Lend the Copy with ISBN ${isbn}` }).click();
  await expect(page.getByText(/^Lent to Camille since/)).toBeVisible();

  // Remove: behind the menu of the Copy, no confirmation.
  await expect(page.getByRole('button', { name: `Remove the Copy with ISBN ${isbn}` })).toBeHidden();
  await page.getByRole('button', { name: `More actions for the Copy with ISBN ${isbn}` }).click();
  await page.getByRole('button', { name: `Remove the Copy with ISBN ${isbn}` }).click();
  const removed = page.locator('[data-toast]', { hasText: 'Copy removed.' });
  await expect(removed).toBeVisible();
  await expect(page.getByRole('button', { name: `More actions for the Copy with ISBN ${isbn}` })).toHaveCount(0);
  await expect(page.getByText(/^Lent to Camille since/)).toBeHidden();

  // Undo: the same Copy, with its Loan.
  await removed.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: `More actions for the Copy with ISBN ${isbn}` })).toBeVisible();
  await expect(page.getByText(/^Lent to Camille since/)).toBeVisible();

  // Saved: a new visit shows it too.
  await page.reload();
  await expect(page.getByText(/^Lent to Camille since/)).toBeVisible();
  await expect(page.getByRole('button', { name: `More actions for the Copy with ISBN ${isbn}` })).toHaveCount(1);
  await islandsLoaded(page);
});
