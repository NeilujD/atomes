import type { Page } from '@playwright/test';
import { expect, quickAdd, test } from './test';

// Spy x Family 16, Kurokawa: its whole Edition Line is recorded.
const spyFamily16 = '9791042021030';
// Unknown to every book source, and never seen by this device.
const unknown = '9791099999993';

async function check(page: Page, isbn: string) {
  await page.getByLabel('ISBN', { exact: true }).fill(isbn);
  await page.getByRole('button', { name: 'Look up' }).click();
}

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
  await setUp.getByRole('button', { name: /^Volume 3, owned/ }).click();
  await setUp.getByRole('button', { name: 'Save series' }).click();
  await expect(setUp).toHaveURL(/\/book/);
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
  await expect(page.getByText('In your Library', { exact: true })).toBeVisible();
  await expect(page.getByText('Reading Status: Not yet')).toBeVisible();

  // Missing from the Series, with the spine row.
  await check(page, volume(3));
  await expect(page.getByText('Missing from Spy x Family')).toBeVisible();
  const spines = page.getByRole('list', { name: 'Volumes of Spy x Family' });
  await expect(spines.getByText('Volume 3: not owned')).toBeAttached();
  await expect(spines.getByText('Volume 4: owned, not read')).toBeAttached();

  // A book the device does not know: never a wrong answer.
  await check(page, unknown);
  await expect(page.getByText('Not in your Library', { exact: true })).toBeVisible();
  await expect(page.getByText('This device does not know this book yet. Check online later.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to Library' })).toBeHidden();

  const checked = [volume(1), volume(3), unknown];
  expect(asked.filter((url) => url.includes('/api/catalog/') || checked.some((isbn) => url.includes(isbn)))).toEqual([]);

  // I bought it: the Copy waits on the device.
  await check(page, volume(3));
  await page.getByRole('button', { name: 'Add to Library' }).click();
  await expect(page.getByText(/Waiting: saved on this device/)).toBeVisible();
});
