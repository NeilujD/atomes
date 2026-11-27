import type { Page } from '@playwright/test';
import { expect, quickAdd, test } from './test';

// A count of "Where you stand" on the Series page: owned, read, missing.
function count(page: Page, label: string) {
  const standing = page.getByLabel('Where you stand');
  return standing.locator('div').filter({ has: page.getByRole('term').filter({ hasText: new RegExp(`^${label}$`) }) }).getByRole('definition');
}

test('Series Onboarding from a later Volume asks first; Yes, a gap the stepper keeps, Save, then Undo on the Series page', async ({ page, signIn }) => {
  await signIn();
  // Spy x Family 16, Kurokawa: its whole Edition Line is recorded.
  await quickAdd(page, '9791042021030');

  await expect(page.getByRole('heading', { name: /Which Volumes of Spy x Family/i })).toBeFocused();
  // Nothing ticked before the answer: only Volume 16 is owned.
  await page.getByRole('button', { name: 'Yes' }).click();
  await expect(page.getByRole('button', { name: 'Volume 1, owned, not read' })).toBeVisible();

  // Volume 3 off, then one less in the range: Volume 3 stays off.
  await page.getByRole('button', { name: /^Volume 3, owned/ }).click();
  await page.getByRole('button', { name: 'One less' }).first().click();
  await expect(page.getByRole('button', { name: /^Volume 3, missing/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Volume 15, missing/ })).toBeVisible();
  await page.getByRole('button', { name: 'One more' }).first().click();
  await expect(page.getByRole('button', { name: /^Volume 3, missing/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Volume 15, owned/ })).toBeVisible();

  // The added Volume is locked (aria-disabled: Playwright will not click it, so the tap is dispatched): a tap says why, on the screen.
  await page.getByRole('button', { name: /^Volume 16, owned, not read, already in your Library/ }).dispatchEvent('click');
  await expect(page.getByText(/Volume 16 is in your Library already/)).toBeVisible();

  await page.getByRole('button', { name: 'Save', exact: true }).click();

  // The Series page, with the 14 Copies just added and Undo.
  await expect(page).toHaveURL(/\/series\?isbn=9791042021030/);
  await expect(count(page, 'owned')).toHaveText('15');
  await expect(page.getByText(/^14 Copies added\./)).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  // Only the Copies onboarding added go: the Quick Add one stays.
  await expect(count(page, 'owned')).toHaveText('1');
  const volumes = page.getByRole('region', { name: 'Volumes' });
  await expect(volumes.getByRole('button', { name: 'Volume 16: owned, not read' })).toBeVisible();
  await expect(volumes.getByRole('button', { name: 'Volume 1: not owned' })).toBeVisible();
});

test('One Piece 56 for a reader with no One Piece: Save with no other tap adds no other Copy', async ({ page, signIn }) => {
  await signIn();
  // One Piece 56, Glénat: a recorded Catalog answer.
  await quickAdd(page, '9782723478991');

  await expect(page.getByText('Do you own Volumes 1–55?')).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page).toHaveURL(/\/series\?isbn=9782723478991/);
  await expect(count(page, 'owned')).toHaveText('1');
  await expect(page.getByText(/^Saved\./)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeHidden();
});

test('a fill of the Edition Line that failed says so; Try again gets the other Volumes, and the choices stay', async ({ page, signIn }) => {
  await signIn();
  // Kaamelott 9, Casterman: its whole Edition Line is recorded.
  // The first answer Series Onboarding gets is the one of a server whose book
  // sources failed: only the Volume added, and `fillFailed`. (Quick Add asks too.)
  let failed = true;
  await page.route('**/api/catalog/editions/9782203085053/volumes', async (route) => {
    const response = await route.fetch();
    if (!failed || !page.url().includes('/onboarding')) return route.fulfill({ response });
    failed = false;
    const answer = (await response.json()) as { volumes: { isbn: string }[] };
    await route.fulfill({ response, json: { ...answer, volumes: answer.volumes.filter(({ isbn }) => isbn === '9782203085053'), fillFailed: true } });
  });
  await quickAdd(page, '9782203085053');

  await expect(page.getByRole('heading', { name: /Which Volumes of Kaamelott/i })).toBeFocused();
  const notice = page.getByText(/The book sources did not answer/);
  await expect(notice).toBeVisible();
  await page.getByRole('button', { name: 'Yes' }).click();

  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(notice).toBeHidden();
  await expect(page.getByRole('button', { name: 'Volume 1, owned, not read' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'All (up to 9)' })).toBeHidden();
});
