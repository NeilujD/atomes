import { expect, test } from './test';

test('A signed-out visitor lands on the sign-in screen', async ({ page }) => {
  await page.goto('/library');

  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole('heading', { name: 'Sign in to Atomes' })).toBeVisible();
});

test('A signed-out visitor never sees the app screen before the sign-in screen', async ({ page }) => {
  // Hold the session check, so the screen is caught before the gate answers.
  let answer = () => {};
  await page.route('**/api/session', (route) => {
    answer = () => void route.continue();
  });

  await page.goto('/library');
  const title = page.locator('[data-view-title]');
  await expect(title).toBeAttached();
  await expect(title).toBeHidden();

  answer();
  await expect(page).toHaveURL(/\/sign-in/);
});

test('When the server does not answer, the mark shows it is working, then the sign-in screen opens', async ({ page }) => {
  // The session check never gets an answer: it gives up after 5 s.
  await page.route('**/api/session', () => {});

  await page.goto('/library');
  await expect(page.getByRole('status').filter({ hasText: 'Checking your sign-in' })).toBeVisible();

  await expect(page).toHaveURL(/\/sign-in/, { timeout: 10_000 });
});
