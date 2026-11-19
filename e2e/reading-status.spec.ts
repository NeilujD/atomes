import { expect, quickAdd, test } from './test';

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

test('The days of a Reading Status: kept by each change, corrected on the Book page, back with Undo', async ({ page, signIn }) => {
  await signIn();
  // La Horde du Contrevent: a recorded standalone novel, so no Series Onboarding.
  await quickAdd(page, '9782072927515');
  await page.getByRole('link', { name: 'Open its Book page' }).click();
  await expect(page).toHaveURL(/\/book/);

  // The day on this device, as a date field shows it (ADR 0019).
  const today = await page.evaluate(() => new Date().toLocaleDateString('en-CA'));
  const status = page.getByRole('combobox', { name: 'Reading Status' });
  const started = page.getByLabel('Started on');
  const finished = page.getByLabel('Finished on');
  await expect(status).toHaveValue('unread');
  await expect(started).toBeHidden();

  // Reading starts today; read finishes today and keeps the start day.
  await status.selectOption({ label: 'Reading' });
  await expect(started).toHaveValue(today);
  await expect(finished).toBeHidden();
  await status.selectOption({ label: 'Read' });
  await expect(finished).toHaveValue(today);
  await expect(started).toHaveValue(today);

  // Finished cannot be before Started: refused, and the saved day comes back.
  await finished.fill('2020-01-01');
  await expect(page.getByText('The finish day cannot be before the start day.')).toBeVisible();
  await expect(finished).toHaveValue(today);

  // The reader corrects the start day; it is saved.
  await started.fill('2026-01-05');
  // The book is inert while it saves.
  await expect(page.locator('[data-book]')).not.toHaveAttribute('inert');
  await page.reload();
  await expect(page.getByLabel('Started on')).toHaveValue('2026-01-05');

  // Back to "not yet" removes both days; Undo in the toast puts them back.
  await status.selectOption({ label: 'Not yet' });
  await expect(started).toBeHidden();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(status).toHaveValue('read');
  await expect(started).toHaveValue('2026-01-05');
  await expect(finished).toHaveValue(today);
});
