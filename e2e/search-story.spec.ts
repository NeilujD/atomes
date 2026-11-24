import { expect, test } from './test';

// A short story printed in a book of stories (CORE-193) on the recorded
// Catalog: "Le Dieu solitaire" has no Edition of its own; Search shows the
// book it is printed in, whose Editions lead to the Shelf Check answer.

test('"Agatha Christie" → Author → "Le Dieu solitaire" → printed in "Tant que brillera le jour" → an Edition → the Shelf Check answer', async ({ page, signIn }) => {
  await signIn();
  await page.goto('/check?mode=search');
  await page.getByLabel('Title or author').fill('Agatha Christie');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: 'Agatha Christie (1890) · 385 Works' }).click();

  const story = page.getByRole('list', { name: 'Works' }).getByRole('button', { name: /^Le Dieu solitaire/ });
  await expect(story).toContainText('Short story');
  await story.click();
  await expect(page.getByRole('heading', { name: 'Le Dieu solitaire' })).toBeVisible();

  await page.getByRole('list', { name: 'Printed in' }).getByRole('button', { name: /^Tant que brillera le jour/ }).click();
  await expect(page.getByRole('heading', { name: 'Tant que brillera le jour' })).toBeVisible();
  // Back returns to the short story.
  await expect(page.getByRole('button', { name: 'Le Dieu solitaire', exact: true })).toBeVisible();

  await page.getByRole('button', { name: /ISBN 9780002326438/ }).click();
  const answer = page.getByRole('dialog', { name: 'Shelf Check' });
  await expect(answer.getByText('Not in your Library', { exact: true })).toBeVisible();
});
