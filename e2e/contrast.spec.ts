import { expect, test } from './test';

// The contrast setting of Settings, kept on this device and applied before
// first paint on every screen (ui-direction: Appearance).
test('High contrast stays on this device, on every screen, until the reader picks System again', async ({ page, signIn }) => {
  await signIn();
  await page.goto('/settings');
  const contrast = page.getByRole('radiogroup', { name: 'Contrast' });
  const root = page.locator('html');

  await expect(contrast.getByRole('radio', { name: 'System' })).toBeChecked();
  await expect(root).not.toHaveAttribute('data-contrast');

  await contrast.getByRole('radio', { name: 'High' }).check();
  await expect(root).toHaveAttribute('data-contrast', 'more');

  // Another screen, and Settings again: the boot script sets it before the page scripts run.
  await page.goto('/library');
  await expect(root).toHaveAttribute('data-contrast', 'more');
  await page.goto('/settings');
  await expect(contrast.getByRole('radio', { name: 'High' })).toBeChecked();

  await contrast.getByRole('radio', { name: 'System' }).check();
  await expect(root).not.toHaveAttribute('data-contrast');
  await page.reload();
  await expect(root).not.toHaveAttribute('data-contrast');
});
