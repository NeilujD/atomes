import { expect, test } from './test';

// The Landing page (M12, CORE-158). The E2E server runs with LANDING_PAGE on
// (the default); `off` is covered by the unit tests (settings, gate, welcome).

test('A visitor who opens Home lands on the Landing page, and never sees Home first', async ({ page }) => {
  // Hold the session check, so the screen is caught before the gate answers.
  let answer = () => {};
  await page.route('**/api/session', (route) => {
    answer = () => void route.continue();
  });

  await page.goto('/');
  const title = page.locator('[data-view-title]');
  await expect(title).toBeAttached();
  await expect(title).toBeHidden();

  answer();
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Know your shelves, even in the shop.' })).toBeVisible();
});

test('On the Landing page, Sign in opens the sign-in screen', async ({ page }) => {
  await page.goto('/welcome');

  await page.getByRole('banner').getByRole('link', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole('heading', { name: 'Sign in to Atomes' })).toBeVisible();
});

test('A reader who has just signed in opens Home, and the Landing page then leads back to it', async ({ page, signIn }) => {
  // Signed in on the server, nothing saved on the device yet: as just after a Sign-in Code.
  await signIn();
  await page.goto('/');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);

  // Saved Account: the Landing page offers the way back.
  await page.goto('/welcome');
  const back = page.getByRole('banner').getByRole('link', { name: 'Open my Library' });
  await expect(back).toBeVisible();
  await back.click();
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test('The Landing page is no wider than a phone screen', async ({ page }) => {
  await page.goto('/welcome');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const width = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, screen: document.documentElement.clientWidth }));
  expect(width.page).toBe(width.screen);
});

test('From the Landing page footer, a visitor reads the Legal notice and the Privacy notice, and comes back each time', async ({ page }) => {
  await page.goto('/welcome');
  const footer = page.getByRole('contentinfo');

  await footer.getByRole('link', { name: 'Legal notice' }).click();
  await expect(page).toHaveURL(/\/legal$/);
  await expect(page.getByRole('heading', { name: 'Legal notice', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Who hosts it' })).toBeVisible();
  // No gate sends the visitor away once the page scripts have run.
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/\/legal$/);
  await page.getByRole('link', { name: 'Close' }).click();
  await expect(page).toHaveURL(/\/welcome$/);

  await footer.getByRole('link', { name: 'Privacy notice' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole('heading', { name: 'Privacy notice', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Close' }).click();
  await expect(page).toHaveURL(/\/welcome$/);
});

test('The sign-in screen links to the Legal notice, in English and in French', async ({ page, baseURL }) => {
  await page.goto('/sign-in');
  await page.getByRole('link', { name: 'Legal notice' }).click();
  await expect(page.getByRole('heading', { name: 'Legal notice', level: 1 })).toBeVisible();

  await page.context().addCookies([{ name: 'atomes-language', value: 'fr', url: baseURL! }]);
  await page.goto('/legal');
  await expect(page.getByRole('heading', { name: 'Mentions légales', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Qui l’héberge' })).toBeVisible();
});
