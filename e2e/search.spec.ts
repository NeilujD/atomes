import { expect, test } from './test';

// Search (ADR 0021, CORE-184) on the recorded Catalog: an old title finds the
// Work, whose Editions come newest first under the title printed on each.
test('To Buy → Search an old title → add the 2020 and 1977 Editions to To Buy, each with its title', async ({ page, signIn }) => {
  await signIn();
  await page.goto('/to-buy');

  // The empty To Buy offers a first book: its button opens Search (CORE-189).
  // The "+" of the view header opens it too (to-buy.spec.ts).
  await page.getByRole('link', { name: 'Find a book' }).click();
  await expect(page).toHaveURL(/\/search$/);

  await page.getByLabel('Title of the book').fill('Dix petits nègres');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: /^Dix Petits Nègres Agatha Christie · 1939/ }).click();

  const editions = page.getByRole('list', { name: 'Editions' }).getByRole('listitem');
  // Newest first: the 2025 Editions, then 2021, then 2020, all titled "Ils étaient dix".
  await expect(editions.first().locator('.search-title')).toHaveText('Ils étaient dix');
  await expect(page.getByText('23 Editions with no ISBN are not shown.')).toBeVisible();

  const livreDePoche2020 = editions.filter({ hasText: 'ISBN 9782253241782' });
  await expect(livreDePoche2020).toContainText('2020 · le Livre de poche');
  await livreDePoche2020.getByRole('button', { name: /^Ils étaient dix/ }).click();
  await livreDePoche2020.getByRole('button', { name: 'Add to To Buy' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Saved/ }).first()).toBeVisible();

  // The 1977 Edition, which BnF knows only by its ISBN-10 (2-253-01709-4).
  const poche1977 = editions.filter({ hasText: 'ISBN 9782253017097' });
  await poche1977.getByRole('button', { name: /^Dix petits nègres/ }).click();
  const add1977 = poche1977.getByRole('button', { name: 'Add to To Buy' });
  await add1977.click();
  await expect(add1977).toBeEnabled();
  await expect(add1977).not.toHaveAttribute('aria-busy', 'true');

  // Each shows on To Buy with its title, not only its ISBN.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'To Buy' }).click();
  const byHand = page.getByRole('region', { name: 'Added by hand' }).getByRole('listitem');
  await expect(byHand.filter({ hasText: 'ISBN 9782253241782' })).toContainText('Ils étaient dix');
  await expect(byHand.filter({ hasText: 'ISBN 9782253017097' })).toContainText('Dix petits nègres');
});
