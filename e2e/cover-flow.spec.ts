import type { Page } from '@playwright/test';
import { expect, quickAdd, test } from './test';

// Cover flow on the phone (CORE-106): the covers are a strip the reader swipes,
// with no Previous, Next or slider. It snaps on a cover, which comes to the
// front; a tap on a side cover brings it to the front, a tap on the front one
// opens its Book page. The turn of the side covers is checked by hand.

// Leave a Book page only once its islands have loaded: an island whose load
// the navigation stops is an unhandled rejection in WebKit.
const islandsLoaded = (page: Page) => expect(page.locator('astro-island[ssr]')).toHaveCount(0);

test('swipe through the covers: the strip snaps on a cover, which comes to the front', async ({ page, signIn }) => {
  test.slow();
  await signIn();
  // Spy x Family 16, Kurokawa: Series Onboarding adds Volumes 1 to 16 once the
  // reader answers that they own Volumes 1 to 15.
  await quickAdd(page, '9791042021030');
  await page.getByRole('button', { name: 'Yes' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/series/);
  await islandsLoaded(page);

  await page.goto('/library');
  await page.getByRole('combobox', { name: 'View' }).selectOption('Cover flow');
  await expect(page.getByText('9 of 16', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Next' })).toHaveCount(0);
  await expect(page.getByRole('slider')).toHaveCount(0);

  // A swipe a little past half a cover to the left: the strip snaps on the next cover.
  const covers = page.locator('.library-flow-cover');
  const strip = page.locator('.library-flow-strip');
  await strip.evaluate((element) => {
    const [first, second] = [...element.children] as HTMLElement[];
    element.scrollBy({ left: (second.offsetLeft - first.offsetLeft) * 0.6, behavior: 'instant' });
  });
  await expect(page.getByText('10 of 16', { exact: true })).toBeVisible();
  await expect(covers.nth(9)).toHaveAttribute('aria-current', 'true');
  // Snapped: the cover in front stands in the middle of the screen.
  await expect
    .poll(async () => {
      const box = (await covers.nth(9).boundingBox())!;
      return Math.abs(box.x + box.width / 2 - page.viewportSize()!.width / 2);
    })
    .toBeLessThanOrEqual(1);

  // A tap on the cover on the left side brings it to the front, and keeps the Library page.
  // The face of a side cover turns and stacks; the reader taps what they see.
  await covers.nth(8).locator('.library-flow-face').click();
  await expect(page.getByText('9 of 16', { exact: true })).toBeVisible();
  await expect(covers.nth(8)).toHaveAttribute('aria-current', 'true');
  await expect(page).toHaveURL(/\/library$/);

  // A tap on the cover in front opens its Book page.
  const href = await covers.nth(8).getAttribute('href');
  await covers.nth(8).click();
  await expect(page).toHaveURL(href!);
});
