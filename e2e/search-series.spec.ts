import { expect, test } from './test';

// Search mode of Check a book: a Series, then an Edition Line, then a Volume
// by its number and title (ADR 0021, CORE-187), on the recorded Catalog.

test('Check → Search "Astérix" → Edition Line → "7 · Le Combat des chefs" → Edition → Add to To Buy → On To Buy', async ({ page, signIn }) => {
  await signIn();
  await page.goto('/check?mode=search');
  await page.getByLabel('Title or author').fill('Astérix');
  await page.getByRole('button', { name: 'Search', exact: true }).click();

  await page.getByRole('list', { name: 'Series' }).getByRole('button', { name: /^Astérix/ }).click();
  await page.getByRole('list', { name: 'Edition Lines' }).getByRole('button', { name: /^Hachette · 2001–2004/ }).click();
  await page.getByRole('list', { name: 'Volumes' }).getByRole('button', { name: '7 · Le Combat des chefs', exact: true }).click();

  // The Editions of Volume 7 in that Edition Line only, each with its Volume and Edition Line name.
  const editions = page.getByRole('list', { name: 'Editions' }).getByRole('listitem');
  await expect(editions.filter({ hasText: 'Dargaud' })).toHaveCount(0);
  const hachette2005 = editions.filter({ hasText: 'ISBN 9782012101395' });
  await expect(hachette2005).toContainText('Volume 7 · Le combat des chefs · Hachette · 2001–2004');
  await hachette2005.getByRole('button').click();

  const answer = page.getByRole('dialog', { name: 'Shelf Check' });
  await expect(answer.getByText('Not in your Library', { exact: true })).toBeVisible();
  await answer.getByRole('button', { name: 'Add to To Buy' }).click();
  await expect(answer).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: 'is on your To Buy list.' }).first()).toBeVisible();

  // Search marks the Edition; To Buy lists it.
  await expect(hachette2005).toContainText('On To Buy');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'To Buy' }).click();
  await expect(page.getByRole('region', { name: 'Added by hand' }).getByRole('listitem').filter({ hasText: 'ISBN 9782012101395' })).toBeVisible();
});
