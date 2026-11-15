import type { Page } from '@playwright/test';
import { expect, quickAdd, test } from './test';

// A Volume the Catalog lacks is in the Missing list of the Series page,
// hatched and counted apart (CORE-117); a tap on it opens its sheet.

function count(page: Page, label: string) {
  const standing = page.getByLabel('Where you stand');
  return standing.locator('div').filter({ has: page.getByRole('term').filter({ hasText: new RegExp(`^${label}$`) }) }).getByRole('definition');
}

test('One Piece 56 with Volumes 1–55 owned: Volume 13, not in the Catalog, is in the Missing list and counted apart', async ({ page, signIn }) => {
  test.slow();
  await signIn();
  // One Piece 56, Glénat: recorded, with no Edition of Volume 13.
  await quickAdd(page, '9782723478991');
  await expect(page.getByText('Do you own Volumes 1–55?')).toBeVisible();
  await page.getByRole('button', { name: 'Yes' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/series\?isbn=9782723478991/);

  await expect(count(page, 'missing')).toHaveText('0');
  await expect(count(page, 'not in the Catalog')).toHaveText('1');
  const missing = page.getByRole('region', { name: 'Missing Volumes' });
  await expect(missing.getByRole('listitem')).toHaveText(['13']);

  // Its sheet asks for its ISBN (CORE-108, e2e/scan-volume.spec.ts); no
  // Correction here: other journeys count the gap at 13.
  await missing.getByRole('button', { name: 'Volume 13, not in the Catalog yet' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add Volume 13 to the Catalog' });
  await expect(sheet.getByLabel('ISBN')).toBeVisible();
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toBeHidden();
});
