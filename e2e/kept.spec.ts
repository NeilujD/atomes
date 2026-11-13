import { expect, quickAdd, test } from './test';

// Spy x Family 16, Kurokawa: its whole Edition Line is recorded.
const spyFamily16 = '9791042021030';

// Playwright's WebKit runs in an ephemeral data store whose Cache Storage does
// not outlive a navigation (checked 2026-11-13: an entry put on one page is
// gone on the next), so this journey across pages runs in Chromium only.
// e2e/shelf-check.spec.ts covers WebKit on one page.
test.skip(({ browserName }) => browserName === 'webkit', 'WebKit test contexts drop Cache Storage across navigations');

test('A Series followed elsewhere is kept on the device for Shelf Check offline, with no visit to Check a book online', async ({ page, context, signIn }) => {
  await signIn();
  await quickAdd(page, spyFamily16);
  // Followed in Series Onboarding, after the visit of Check a book: every Volume but 3.
  await expect(page.getByRole('heading', { name: /Which Volumes of Spy x Family/i })).toBeVisible();
  await page.getByRole('button', { name: /^Volume 3, owned/ }).click();
  await page.getByRole('button', { name: 'Save series' }).click();
  await expect(page).toHaveURL(/\/book/);

  // The Book page read the Library: its Edition Line is now on the device.
  await expect
    .poll(() => page.evaluate(async (anchor) => Boolean(await caches.match(`/api/catalog/editions/${anchor}/volumes`)), spyFamily16))
    .toBe(true);
  const line = (await (await page.request.get(`/api/catalog/editions/${spyFamily16}/volumes`)).json()) as { volumes: { isbn: string; volume: number }[] };
  const volume3 = line.volumes.find((each) => each.volume === 3)!.isbn;

  // Check a book opens, but the Catalog cannot answer it: nothing more is kept there.
  await context.route('**/api/catalog/**', (route) => route.abort('internetdisconnected'));
  await page.goto('/check');
  await expect(page.getByLabel('ISBN', { exact: true })).toBeVisible();
  await context.setOffline(true);

  await page.getByLabel('ISBN', { exact: true }).fill(volume3);
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(page.getByText('Missing from Spy x Family')).toBeVisible();
});
