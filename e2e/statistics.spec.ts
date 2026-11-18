import type { Page } from '@playwright/test';
import { expect, quickAdd, test } from './test';

// Statistics (CORE-147, ADR 0019), on a 390 px phone: reached from You, a
// book marked read on its Book page counts in the lead number and in the
// column of this month; a bulk mark sets no day, so it changes the foot line
// only; the period and the Label live in the URL, so Back and a reload keep them.

// Leave a page only once its islands have loaded: an island whose load the
// navigation stops is an unhandled rejection in WebKit.
const islandsLoaded = (page: Page) => expect(page.locator('astro-island[ssr]')).toHaveCount(0);
// The lead number and its period, one line: "1 read in 2026".
const lead = (page: Page) => page.getByRole('region', { name: 'In short' }).locator('p').first();

test('mark a book read, then a bulk mark; the period and the Label survive Back and a reload', async ({ page, signIn }) => {
  test.slow();
  await signIn();
  // La Horde du Contrevent (a standalone novel) and One Piece 56: Quick Add keeps today as the day each was got.
  await quickAdd(page, '9782072927515');
  await expect(page.getByText(/is in your Library/)).toBeVisible();
  await islandsLoaded(page);
  await quickAdd(page, '9782723478991');
  await page.getByRole('link', { name: 'Skip' }).click();
  await expect(page).toHaveURL(/\/book/);
  await islandsLoaded(page);

  // The day on this device, as the screen names it.
  const { year, month } = await page.evaluate(() => ({
    year: String(new Date().getFullYear()),
    month: new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date()),
  }));
  const thisMonth = (read: number, added: number) => page.getByRole('button', { name: `${month}: Read ${read}, Added ${added}` });

  // From You (the tab bar has no Statistics), the row of Settings.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'You' }).click();
  await page.getByRole('main').getByRole('link', { name: 'Statistics' }).click();
  await expect(page).toHaveURL(/\/statistics$/);
  // No read has a day yet: the totals, and how to add days.
  await expect(lead(page)).toHaveText(`0 read in ${year}`);
  await expect(page.getByText(/No book read has a finish day yet/)).toBeVisible();
  // The island has drawn: Share opens the picture (share-picture.spec.ts).
  await expect(page.getByRole('button', { name: 'Share' })).toBeEnabled();
  await islandsLoaded(page);

  // Read, on the Book page of La Horde: today is its finish day.
  await page.goto('/library');
  await page.getByRole('main').getByRole('list').getByRole('link').filter({ hasText: 'La Horde' }).click();
  await expect(page).toHaveURL(/\/book/);
  await page.getByRole('combobox', { name: 'Reading Status' }).selectOption({ label: 'Read' });
  await expect(page.getByText('Saved to your Library.')).toBeVisible();
  await islandsLoaded(page);

  await page.goto('/statistics');
  await expect(lead(page)).toHaveText(`1 read in ${year}`);
  await expect(thisMonth(1, 2)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/no date/)).toHaveCount(0);
  // The recorded BnF answer gives La Horde "1 vol. (700 p.)" (CORE-152).
  await expect(page.locator('dl').filter({ has: page.getByRole('term').getByText('Pages read', { exact: true }) }).getByRole('definition')).toHaveText('700');
  await islandsLoaded(page);

  // A bulk mark in the Library: One Piece 56 read, with no day. Also a Label on La Horde.
  await page.goto('/library');
  const main = page.getByRole('main');
  const bar = page.getByRole('toolbar', { name: 'Selection' });
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await main.getByRole('list').getByRole('button').filter({ hasText: 'La Horde' }).click();
  await bar.getByRole('button', { name: 'Label', exact: true }).click();
  const labelSheet = page.getByRole('dialog', { name: 'Label on 1 book' });
  await labelSheet.getByRole('textbox', { name: 'New Label' }).fill('SF');
  await labelSheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('SF on 1 book.')).toBeVisible();
  await bar.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await main.getByRole('list').getByRole('button').filter({ hasText: 'One Piece' }).click();
  await bar.getByRole('button', { name: 'Reading Status' }).click();
  await page.getByRole('dialog', { name: 'Reading Status of 1 book' }).getByRole('button', { name: 'Read', exact: true }).click();
  await expect(page.getByText('Read: 1 book.')).toBeVisible();
  await islandsLoaded(page);

  // The lead number and the column stay; the foot line counts the read with no day.
  await page.goto('/statistics');
  await expect(page.getByText('1 book read has no date. It counts in the totals, not by month.')).toBeVisible();
  await expect(lead(page)).toHaveText(`1 read in ${year}`);
  await expect(thisMonth(1, 2)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add dates' })).toHaveAttribute('href', '/library');

  // All time counts it; then the Label SF, from the Filter sheet.
  const periods = page.getByRole('group', { name: 'Period' });
  await periods.getByRole('button', { name: 'All time' }).click();
  await expect(lead(page)).toHaveText('2 read in all');
  await page.getByRole('button', { name: 'Filter' }).click();
  const sheet = page.getByRole('dialog', { name: 'Filter' });
  await sheet.getByRole('button', { name: 'SF' }).click();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(lead(page)).toHaveText('1 read in all');
  await expect(page).toHaveURL(/\?period=all&label=/);

  // A reload keeps both; Back goes to All time with no Label, then to the year.
  await page.reload();
  await expect(lead(page)).toHaveText('1 read in all');
  await expect(periods.getByRole('button', { name: 'All time' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /Filter/ })).toContainText('1');
  await page.goBack();
  await expect(lead(page)).toHaveText('2 read in all');
  await page.goBack();
  await expect(lead(page)).toHaveText(`1 read in ${year}`);
  await expect(periods.getByRole('button', { name: year })).toHaveAttribute('aria-pressed', 'true');
  await islandsLoaded(page);
});
