import { expect, test } from './test';

test('Set the Reading Status with its chip, on Check a book and on the Book page', async ({ page, signIn }) => {
  await signIn();
  // One Piece 56, Glénat: a recorded Catalog answer.
  await page.goto('/check');
  await page.getByLabel('ISBN', { exact: true }).fill('9782723478991');
  await page.getByRole('button', { name: 'Look up' }).click();

  // Quick Add asks with one small chip: three answers, no Abandoned.
  const question = page.getByRole('combobox', { name: 'Have you read it?' });
  await expect(question).toHaveValue('unread');
  await expect(question.getByRole('option')).toHaveText(['Not yet', 'Reading', 'Read']);
  await question.selectOption({ label: 'Reading' });
  await page.getByRole('button', { name: 'Add to Library' }).click();

  await expect(page.getByRole('heading', { name: /Which Volumes of One Piece/ })).toBeVisible();
  await page.getByRole('link', { name: 'Skip' }).click();
  await expect(page).toHaveURL(/\/book/);

  // The Book page shows the status chosen, on one line no wider than its text.
  const status = page.getByRole('combobox', { name: 'Reading Status' });
  await expect(status).toHaveValue('reading');
  const box = (await status.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(44);
  expect(box.width).toBeLessThan(160);
  await expect(page.getByLabel('Finished on')).toBeHidden();

  // Read: the date field shows, and the status is saved.
  await status.selectOption({ label: 'Read' });
  await expect(page.getByLabel('Finished on')).toBeVisible();
  await expect(page.getByText('Saved to your Library.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Reading Status' })).toHaveValue('read');

  // Abandoned is offered on the Book page.
  await page.getByRole('combobox', { name: 'Reading Status' }).selectOption({ label: 'Abandoned' });
  await expect(page.getByLabel('Finished on')).toBeHidden();
});
