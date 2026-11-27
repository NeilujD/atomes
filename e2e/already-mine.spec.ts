import type { Page } from '@playwright/test';
import { expect, test } from './test';

// "Already mine" (ADR 0019, amendment 2026-11-27), on a 390 px phone: a book
// scanned and added as read counts this year, unless the reader taps the
// action of the toast; then it has no day, and counts in All time only.

const islandsLoaded = (page: Page) => expect(page.locator('astro-island[ssr]')).toHaveCount(0);
const lead = (page: Page) => page.getByRole('region', { name: 'In short' }).locator('p').first();

test('Add and mark as read, then Already mine: the book counts in All time, not in this year', async ({ page, signIn }) => {
  await signIn();
  await page.goto('/check');
  // La Horde du Contrevent: a recorded standalone novel, so no Series Onboarding.
  await page.getByLabel('ISBN', { exact: true }).fill('9782072927515');
  await page.getByRole('button', { name: 'Look up' }).click();
  await page.getByRole('dialog', { name: 'Shelf Check' }).getByRole('button', { name: 'Add and mark as read' }).click();
  await expect(page.getByText(/is in your Library/)).toBeVisible();

  await page.getByRole('button', { name: 'Already mine' }).click();
  await expect(page.getByText(/has no date now: it counts in All time/)).toBeVisible();
  await islandsLoaded(page);

  // No day in any year: the screen opens on All time, and the foot line counts both.
  await page.goto('/statistics');
  await expect(lead(page)).toHaveText('1 read in all');
  await expect(page.getByRole('group', { name: 'Period' }).getByRole('button')).toHaveText(['All time']);
  await expect(page.getByText('1 book read and 1 Copy have no date. They count in the totals, not by month.')).toBeVisible();
  await islandsLoaded(page);
});
