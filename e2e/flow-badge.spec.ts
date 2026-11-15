import { expect, quickAdd, test } from './test';

// The dev server shows the "Local" environment badge (CORE-118).
test('On Series Onboarding the environment badge scrolls away with the page, so it covers no tile', async ({ page, signIn }) => {
  await signIn();
  // One Piece 56, Glénat: ranges of ten tiles; one open range makes the page taller than a phone screen.
  await quickAdd(page, '9782723478991');
  await expect(page.getByText('Do you own Volumes 1–55?')).toBeVisible();
  const badge = page.getByText('Local', { exact: true });
  await expect(badge).toBeInViewport();

  await page.getByRole('button', { name: 'Yes' }).click();
  await page.getByText('Volumes 31–40').click();
  await page.getByRole('button', { name: /^Volume 40,/ }).scrollIntoViewIfNeeded();
  await expect(badge).not.toBeInViewport();
});
