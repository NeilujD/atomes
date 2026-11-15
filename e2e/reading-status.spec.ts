import { expect, test } from './test';

test('Set the Reading Status: Read with Add on Check a book, then its chip on the Book page', async ({ page, signIn }) => {
  await signIn();
  // One Piece 56, Glénat: a recorded Catalog answer.
  await page.goto('/check');
  await page.getByLabel('ISBN', { exact: true }).fill('9782723478991');
  await page.getByRole('button', { name: 'Look up' }).click();

  // The result screen asks nothing: "Add and mark as read" saves the Copy and Read.
  const screen = page.getByRole('dialog', { name: 'Shelf Check' });
  await expect(screen.getByRole('combobox')).toHaveCount(0);
  await screen.getByRole('button', { name: 'Add and mark as read' }).click();

  await expect(page.getByRole('heading', { name: /Which Volumes of One Piece/ })).toBeVisible();
  await page.getByRole('link', { name: 'Skip' }).click();
  await expect(page).toHaveURL(/\/book/);

  // The Book page shows Read, on one line no wider than its text, with its date field.
  const status = page.getByRole('combobox', { name: 'Reading Status' });
  await expect(status).toHaveValue('read');
  const box = (await status.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(44);
  expect(box.width).toBeLessThan(160);
  await expect(page.getByLabel('Finished on')).toBeVisible();

  // Reading: the date field goes, and the status is saved.
  await status.selectOption({ label: 'Reading' });
  await expect(page.getByLabel('Finished on')).toBeHidden();
  await expect(page.getByText('Saved to your Library.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Reading Status' })).toHaveValue('reading');

  // Abandoned is offered on the Book page.
  await page.getByRole('combobox', { name: 'Reading Status' }).selectOption({ label: 'Abandoned' });
  await expect(page.getByLabel('Finished on')).toBeHidden();
});
