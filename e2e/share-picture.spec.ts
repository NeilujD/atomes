import { readFile } from 'node:fs/promises';
import type { Download, Page } from '@playwright/test';
import { expect, quickAdd, test } from './test';

// Share a picture of Statistics (CORE-149, ADR 0019), on a 390 px phone: the
// device draws it, Download gives a PNG of 1080 × 1920 (Story) or
// 1080 × 1080 (Square), and no request leaves the page while the picture is
// made, downloaded and shared. The share sheet itself needs a real phone
// (CORE-150): here a browser that can share a file is a stub.

// Leave a page only once its islands have loaded: an island whose load the
// navigation stops is an unhandled rejection in WebKit.
const islandsLoaded = (page: Page) => expect(page.locator('astro-island[ssr]')).toHaveCount(0);

// The width and the height of a PNG: its IHDR chunk, after the 8-byte signature.
async function pngSize(download: Download): Promise<{ width: number; height: number }> {
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function statisticsWithABook(page: Page, signIn: () => Promise<void>) {
  await signIn();
  // La Horde du Contrevent: Quick Add keeps today as the day it was got.
  await quickAdd(page, '9782072927515');
  await expect(page.getByText(/is in your Library/)).toBeVisible();
  await islandsLoaded(page);
  await page.goto('/statistics');
  await expect(page.getByRole('region', { name: 'In short' })).toBeVisible();
}

test('Download gives the Story and the Square PNG; the dialog closes with Escape, Close and Back; no request leaves the page', async ({ page, signIn }) => {
  test.slow();
  await statisticsWithABook(page, signIn);
  const year = await page.evaluate(() => String(new Date().getFullYear()));
  const share = page.getByRole('button', { name: 'Share', exact: true });

  // From here, the page asks nothing of any server.
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));

  await share.click();
  const dialog = page.getByRole('dialog', { name: 'Share' });
  await expect(dialog.getByRole('img', { name: `Picture: 0 read in ${year}, 1 added, 0 Series followed.` })).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'Story' })).toBeChecked();

  const download = dialog.getByRole('link', { name: 'Download' });
  await expect(download).toHaveAttribute('download', `atomes-${year}-story.png`);
  let saved = page.waitForEvent('download');
  await download.click();
  expect(await pngSize(await saved)).toEqual({ width: 1080, height: 1920 });

  await dialog.getByText('Square').click();
  await expect(download).toHaveAttribute('download', `atomes-${year}-square.png`);
  await expect(dialog.getByRole('switch', { name: 'Series names' })).toBeDisabled();
  saved = page.waitForEvent('download');
  await download.click();
  expect(await pngSize(await saved)).toEqual({ width: 1080, height: 1080 });

  // Escape, Close and browser Back each close it, and the focus returns to Share.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(share).toBeFocused();
  await share.click();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await expect(share).toBeFocused();
  await share.click();
  await expect(dialog).toBeVisible();
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(share).toBeFocused();
  await expect(page).toHaveURL(/\/statistics$/);

  expect(requests.filter((url) => !url.startsWith('blob:') && !url.startsWith('data:'))).toEqual([]);
  await islandsLoaded(page);
});

test('a browser that cannot share a file shows Download only; one that can sends the PNG from the tap', async ({ page, signIn }) => {
  test.slow();
  // No Web Share with files, as Firefox.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'canShare', { configurable: true, value: undefined });
  });
  // Any Library: one spec file has one reader, whose book the journey above may have added.
  await signIn();
  await page.goto('/statistics');
  const share = page.getByRole('button', { name: 'Share', exact: true });
  await share.click();
  const dialog = page.getByRole('dialog', { name: 'Share' });
  await expect(dialog.getByRole('link', { name: 'Download' })).toHaveAttribute('href', /^blob:/);
  await expect(dialog.getByRole('button', { name: 'Share the picture' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  // Closed, the dialog leaves its history entry (history.back): wait for it before the reload.
  await page.waitForFunction(() => (history.state as { statisticsShare?: boolean } | null)?.statisticsShare !== true);
  await islandsLoaded(page);

  // A browser that can: its share() gets the PNG, in the tap.
  await page.addInitScript(() => {
    const shared: { name: string; type: string; size: number }[] = [];
    Object.assign(window, { shared });
    Object.defineProperty(Navigator.prototype, 'canShare', { configurable: true, value: (data: ShareData) => (data.files?.length ?? 0) > 0 });
    Object.defineProperty(Navigator.prototype, 'share', {
      configurable: true,
      value: (data: ShareData) => {
        if ('userActivation' in navigator && !navigator.userActivation.isActive) return Promise.reject(new DOMException('No tap', 'NotAllowedError'));
        shared.push(...(data.files ?? []).map(({ name, type, size }) => ({ name, type, size })));
        return Promise.resolve();
      },
    });
  });
  await page.reload();
  await share.click();
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await dialog.getByRole('button', { name: 'Share the picture' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { shared: { name: string; type: string }[] }).shared)).toEqual([
    expect.objectContaining({ name: expect.stringMatching(/^atomes-\d{4}-story\.png$/), type: 'image/png' }),
  ]);
  await expect(dialog.getByRole('status')).toHaveCount(0);
  expect(requests).toEqual([]);
  await islandsLoaded(page);
});
