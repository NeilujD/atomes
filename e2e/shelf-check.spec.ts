import type { Page } from '@playwright/test';
import { expect, quickAdd, test } from './test';

// Spy x Family 16, Kurokawa: its whole Edition Line is recorded.
const spyFamily16 = '9791042021030';
// Unknown to every book source, and never seen by this device.
const unknown = '9791099999993';

// Looks the book up by its ISBN; a result screen still open closes first (Escape).
async function check(page: Page, isbn: string) {
  if (await page.getByRole('dialog', { name: 'Shelf Check' }).isVisible()) {
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Shelf Check' })).toBeHidden();
  }
  await page.getByLabel('ISBN', { exact: true }).fill(isbn);
  await page.getByRole('button', { name: 'Look up' }).click();
}

test('Shelf Check: the result screen opens over Check a book, the answer first, focused, with no scroll', async ({ page, signIn }) => {
  await signIn();
  // A whole phone screen (390 × 844), not only the part under the browser bars.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/check');
  // One Piece 56, Glénat: a recorded Catalog answer, not in this reader's Library.
  await check(page, '9782723478991');

  const screen = page.getByRole('dialog', { name: 'Shelf Check' });
  const answer = screen.getByText('Not in your Library', { exact: true });
  await expect(answer).toBeInViewport({ ratio: 1 });
  // Focus goes to the answer (screen readers hear it first).
  await expect(page.locator(':focus')).toContainText('Not in your Library');
  // The answer is above the book it is about.
  const [answerBox, titleBox] = await Promise.all([answer.boundingBox(), screen.getByRole('heading', { name: 'One Piece, Volume 56' }).boundingBox()]);
  expect(answerBox!.y).toBeLessThan(titleBox!.y);
  // Over the whole screen: the tab bar does not show over it.
  const bottom = await page.evaluate(() => document.elementFromPoint(195, 838)?.closest('dialog')?.dataset.result);
  expect(bottom).toBe('');
});

test('Shelf Check: the answer, the cover and Add fit in one phone screen, Private is one quiet chip', async ({ page, signIn }) => {
  await signIn();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/check');
  // One Piece 56, Glénat: not in this reader's Library; its Series card comes too.
  await check(page, '9782723478991');
  const screen = page.getByRole('dialog', { name: 'Shelf Check' });
  await expect(screen.getByText(/You have 0 of 113/)).toBeVisible();

  await expect(screen.getByText('Not in your Library', { exact: true })).toBeInViewport({ ratio: 1 });
  await expect(screen.locator('.result-cover')).toBeInViewport({ ratio: 1 });
  await expect(screen.getByRole('button', { name: 'I have it' })).toBeInViewport({ ratio: 1 });
  await expect(screen.getByRole('button', { name: 'Add and mark as read' })).toBeInViewport({ ratio: 1 });
  // Copies are never Shared: nothing to explain or change, one word says it.
  await expect(screen.getByText('Private', { exact: true })).toBeAttached();
  await expect(page.getByText(/Only you can see this book/)).toBeHidden();
});

test('Shelf Check: Back and Close leave the result screen, not the page; after Add, back to the ISBN field with a toast', async ({ page, signIn }) => {
  await signIn();
  await page.goto('/check');
  // La Horde du Contrevent: a recorded standalone novel, not in this reader's Library.
  const horde = '9782072927515';
  await check(page, horde);
  const screen = page.getByRole('dialog', { name: 'Shelf Check' });
  await expect(screen.getByText('Not in your Library', { exact: true })).toBeVisible();

  // Browser Back closes the screen and stays on Check a book.
  await page.goBack();
  await expect(screen).toBeHidden();
  await expect(page).toHaveURL(/\/check$/);

  // The close icon too, then Escape.
  await check(page, horde);
  await screen.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(screen).toBeHidden();
  await check(page, horde);
  await expect(screen).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(screen).toBeHidden();
  await expect(page).toHaveURL(/\/check$/);

  // Add: no Series, so no Series Onboarding. The screen closes, the reader is back where they typed.
  await check(page, horde);
  await screen.getByRole('button', { name: 'I have it' }).click();
  await expect(screen).toBeHidden();
  await expect(page.getByText(/is in your Library/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open its Book page' })).toBeVisible();
  await expect(page.getByLabel('ISBN', { exact: true })).toBeFocused();
  await expect(page.getByLabel('ISBN', { exact: true })).toHaveValue('');

  // Checked again: owned, in orange words, with the date of the Copy and the title to its Book page.
  await check(page, horde);
  await expect(screen.getByText('Already in your Library', { exact: true })).toBeVisible();
  await expect(screen.getByText(/^Added on /)).toBeAttached();
  await expect(screen.getByRole('link', { name: /La horde du Contrevent/i })).toHaveAttribute('href', /\/book\?work=/);
  await expect(screen.getByRole('button', { name: 'Add another Copy' })).toBeVisible();
});

test('Shelf Check offline: owned, missing and unknown books, and no ISBN leaves the device', async ({ page, context, browser, baseURL, signIn }) => {
  await signIn();
  // The reader owns every Volume but 3, and follows the Series: set up on
  // another device (browser context). Playwright's WebKit keeps Cache Storage
  // in an ephemeral store that drops, some time after a navigation, what the
  // pages before wrote: on one device, the Catalog data the Book page kept
  // could take with it what Check a book keeps next (e2e/kept.spec.ts).
  const other = await browser.newContext({ baseURL });
  await other.addCookies(await context.cookies());
  const origin = new URL(baseURL!).origin;
  await other.route((url) => url.origin !== origin, (route) => route.abort('blockedbyclient'));
  const setUp = await other.newPage();
  await quickAdd(setUp, spyFamily16);
  await expect(setUp.getByRole('heading', { name: /Which Volumes of Spy x Family/i })).toBeVisible();
  await setUp.getByRole('button', { name: 'Yes' }).click();
  await setUp.getByRole('button', { name: /^Volume 3, owned/ }).click();
  await setUp.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(setUp).toHaveURL(/\/series/);
  await other.close();

  const line = (await (await page.request.get(`/api/catalog/editions/${spyFamily16}/volumes`)).json()) as { volumes: { isbn: string; volume: number }[] };
  const volume = (n: number) => line.volumes.find((each) => each.volume === n)!.isbn;

  // Online, Check a book keeps on the device what Shelf Check needs offline.
  await page.goto('/check');
  await expect(page.getByText(/Ready to check books offline/)).toBeVisible();

  const asked: string[] = [];
  page.on('request', (request) => asked.push(request.url()));
  await context.setOffline(true);

  // Owned: Volume 1 was never looked up on its own; the device has it from the Edition Line.
  await check(page, volume(1));
  await expect(page.getByText('Already in your Library', { exact: true })).toBeVisible();

  // Missing from the Series, with the Series card.
  await check(page, volume(3));
  await expect(page.getByText('Missing from Spy x Family')).toBeVisible();
  const card = page.getByRole('region', { name: 'Your Series' });
  await expect(card).toContainText('15 owned · 0 read');
  await expect(card).toContainText('You have 15 of 16 · 1 missing');

  // A book the device does not know: never a wrong answer, and no colour.
  await check(page, unknown);
  await expect(page.getByText('Cannot tell on this device', { exact: true })).toBeVisible();
  await expect(page.getByText('This device does not know this book yet. Check online later.')).toBeVisible();
  await expect(page.locator('.result-screen')).toHaveAttribute('data-tone', 'unknown');
  await expect(page.getByRole('button', { name: 'I have it' })).toBeHidden();

  const checked = [volume(1), volume(3), unknown];
  expect(asked.filter((url) => url.includes('/api/catalog/') || checked.some((isbn) => url.includes(isbn)))).toEqual([]);

  // I bought it: the Copy waits on the device.
  await check(page, volume(3));
  await page.getByRole('button', { name: 'I have it' }).click();
  await expect(page.getByText(/Waiting: saved on this device/)).toBeVisible();
});

test('Shelf Check: the Series line and Follow for a Series not followed; offline, the same line', async ({ page, context, browser, baseURL, signIn }) => {
  await signIn();
  // One Piece 56, Glénat: the Catalog lists Volumes 1 to 113 of its Edition Line, but 13.
  const onePiece56 = '9782723478991';
  // The reader owns 56 and skipped Series Onboarding: the Series is not
  // followed. Set up on another device, as in the offline test above.
  const other = await browser.newContext({ baseURL });
  await other.addCookies(await context.cookies());
  const origin = new URL(baseURL!).origin;
  await other.route((url) => url.origin !== origin, (route) => route.abort('blockedbyclient'));
  const setUp = await other.newPage();
  await quickAdd(setUp, onePiece56);
  await expect(setUp.getByRole('heading', { name: /Which Volumes of One Piece/ })).toBeVisible();
  await setUp.getByRole('link', { name: 'Skip' }).click();
  await expect(setUp).toHaveURL(/\/book/);
  await other.close();

  await page.goto('/check');
  await check(page, onePiece56);
  await expect(page.getByText('Already in your Library', { exact: true })).toBeVisible();
  await expect(page.getByText('You have 1 of 113 · 54 missing')).toBeVisible();

  // Follow: the Series is followed in this Edition Line, so the device keeps
  // its line for Shelf Check offline. The line stays, Follow goes.
  await page.getByRole('button', { name: 'Follow' }).click();
  await expect(page.getByRole('button', { name: 'Follow' })).toBeHidden();
  await expect(page.getByText('You have 1 of 113 · 54 missing')).toBeVisible();
  await expect
    .poll(() => page.evaluate(async (isbn) => Boolean(await caches.match(`/api/catalog/editions/${isbn}/volumes`)), onePiece56))
    .toBe(true);

  // Airplane mode: the same line, from this device.
  await context.setOffline(true);
  await check(page, onePiece56);
  await expect(page.getByText('Already in your Library', { exact: true })).toBeVisible();
  await expect(page.getByText('You have 1 of 113 · 54 missing')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Follow' })).toBeHidden();
});

test('the Check tab opens the camera at once; with no camera, the ISBN field and the reason', async ({ page, signIn }) => {
  await signIn();
  await page.goto('/library');

  // The browser of the test has no camera (and no permission to ask for one):
  // the camera view closes and the reader types the ISBN instead. Chromium and
  // WebKit give different errors: the reason is not checked word for word.
  await page.getByRole('link', { name: 'Check', exact: true }).click();

  await expect(page.getByLabel('ISBN', { exact: true })).toBeFocused();
  await expect(page.locator('#isbn-hint')).not.toHaveText('The 13 digits under the barcode, on the back cover.');
  await expect(page.getByRole('dialog')).toBeHidden();
  // A reload or a Back does not open the camera again.
  await expect(page).toHaveURL(/\/check$/);
});
