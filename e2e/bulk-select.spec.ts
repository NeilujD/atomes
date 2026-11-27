import type { Page } from '@playwright/test';
import { expect, quickAdd, test } from './test';

// Bulk select (CORE-109), on a 390 px phone: "Select" in the Library, a tap
// picks a book, the bar at the bottom puts a Label on every picked Work with
// one toast, and Undo takes it off. On the Series page, a tap on a spine picks
// its Volume, and one action sets their Reading Status or marks them Owned.

// Leave a page only once its islands have loaded: an island whose load the
// navigation stops is an unhandled rejection in WebKit.
const islandsLoaded = (page: Page) => expect(page.locator('astro-island[ssr]')).toHaveCount(0);

test('pick three books, add the Label Shōnen to all of them, Undo takes it off; then set Read on two Volumes of a Series and mark two others Owned', async ({ page, signIn }) => {
  test.slow();
  await signIn();
  // One Piece 56 and 112 (Glénat), and La Horde du Contrevent.
  await quickAdd(page, '9782723478991');
  await page.getByRole('link', { name: 'Skip' }).click();
  await expect(page).toHaveURL(/\/book/);
  await islandsLoaded(page);
  await quickAdd(page, '9782344068922');
  await expect(page).toHaveURL(/\/book/);
  await islandsLoaded(page);
  await quickAdd(page, '9782072927515');
  await expect(page.getByText(/is in your Library/)).toBeVisible();
  await islandsLoaded(page);

  await page.goto('/library');
  const main = page.getByRole('main');
  await expect(main.getByRole('list').getByRole('link')).toHaveCount(3);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const books = main.getByRole('list').getByRole('button');
  await expect(books).toHaveCount(3);
  for (const each of await books.all()) await each.click();
  const bar = page.getByRole('toolbar', { name: 'Selection' });
  await expect(bar.getByText('3 selected')).toBeVisible();

  const addShonen = async () => {
    await bar.getByRole('button', { name: 'Label', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Label on 3 books' });
    await sheet.getByRole('textbox', { name: 'New Label' }).fill('Shōnen');
    await sheet.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Shōnen on 3 books.')).toBeVisible();
  };

  // Undo, from the toast: the new Label goes.
  await addShonen();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Undone.')).toBeVisible();
  await bar.getByRole('button', { name: 'Label', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Label on 3 books' }).getByRole('list', { name: 'Add one of your Labels' })).toHaveCount(0);
  await page.getByRole('dialog', { name: 'Label on 3 books' }).getByRole('button', { name: 'Close' }).click();

  // Again, and kept: the Label filter lists the three Works.
  await addShonen();
  await bar.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Sort and filter' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Shōnen/ }).click();
  await page.getByRole('button', { name: 'Show 3 books' }).click();
  await expect(page.getByText('3 of 3 books', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear all' }).click();

  // The One Piece Series page: pick Volumes 56 and 112, set them Read.
  await main.getByRole('list').getByRole('link').filter({ hasText: '56' }).click();
  await expect(page).toHaveURL(/\/book/);
  await islandsLoaded(page);
  await page.getByRole('main').getByRole('link', { name: 'One Piece', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'One Piece', level: 1 })).toBeVisible();
  await islandsLoaded(page);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('button', { name: 'Volume 56: owned, not read' }).click();
  await page.getByRole('button', { name: 'Volume 112: owned, not read' }).click();
  await bar.getByRole('button', { name: 'Reading Status' }).click();
  await page.getByRole('dialog', { name: 'Reading Status of 2 books' }).getByRole('button', { name: 'Read', exact: true }).click();
  await expect(page.getByText('Read: 2 books.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Volume 56: read' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Volume 112: read' })).toBeVisible();

  // Volumes 1 and 2 are on the shelf too: "Owned" adds a Copy of each, Undo takes them off.
  await page.getByRole('button', { name: 'Volume 1: not owned' }).click();
  await page.getByRole('button', { name: 'Volume 2: not owned' }).click();
  await bar.getByRole('button', { name: 'Owned', exact: true }).click();
  const ownedToast = page.locator('[data-toast]').filter({ hasText: '2 Volumes marked owned.' });
  await expect(ownedToast).toBeVisible();
  await expect(page.getByRole('button', { name: 'Volume 1: owned, not read' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Volume 2: owned, not read' })).toBeVisible();
  await ownedToast.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: 'Volume 1: not owned' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Volume 2: not owned' })).toBeVisible();
  await islandsLoaded(page);
});
