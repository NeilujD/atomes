import { expect, quickAdd, test } from './test';

// Search mode with no network (CORE-191): the words are looked for in the
// books this device keeps for Shelf Check, and a match gets the Shelf Check
// answer of a scan offline. Nothing is asked, no word leaves the device.

// One Piece 56, Glénat: a recorded Catalog answer.
const onePiece56 = '9782723478991';

test('offline, Search finds a Library title on this device and gives its Shelf Check; no match offers Scan', async ({ page, context, browser, baseURL, signIn }) => {
  await signIn();
  // The Copy is added in another context, as in shelf-check.spec.ts: this one keeps its own cache.
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

  // Online, Check a book keeps on the device what Shelf Check needs offline.
  await page.goto('/check');
  await expect(page.getByText(/Ready to check books offline/)).toBeVisible();

  const asked: string[] = [];
  page.on('request', (request) => asked.push(request.url()));
  await context.setOffline(true);

  await page.getByRole('radio', { name: 'Search' }).check();
  await page.getByLabel('Title or author').fill('one piece');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('No connection: only the books kept on this device.')).toBeVisible();
  await page.getByRole('list', { name: 'Editions' }).getByRole('button', { name: /^One Piece/ }).click();
  await expect(page.getByText('Already in your Library', { exact: true })).toBeVisible();

  // No match: not a sure "not in your Library"; the words stay, and Scan is offered.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Shelf Check' })).toBeHidden();
  await page.getByLabel('Title or author').fill('Astérix');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText(/^Nothing on this device matches these words/)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Editions' })).toBeHidden();
  await expect(page.getByLabel('Title or author')).toHaveValue('Astérix');
  await expect(page.getByRole('button', { name: 'Scan the barcode' })).toBeVisible();

  // No word and no ISBN left the device (the Library sync may try, with neither).
  expect(asked.filter((url) => url.includes('/api/catalog/') || /piece|ast/i.test(decodeURIComponent(url)))).toEqual([]);
});
