import { expect, test } from './test';

test('A signed-out visitor lands on the sign-in screen', async ({ page }) => {
  await page.goto('/library');

  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole('heading', { name: 'Sign in to Atomes' })).toBeVisible();
});
