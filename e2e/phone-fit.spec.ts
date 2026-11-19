import { expect, quickAdd, test } from './test';

// A 360 px Android phone. A page wider than the screen scrolls sideways, and
// Chrome then zooms out a little, which pushes the tab bar under the screen edge.
test.use({ viewport: { width: 360, height: 740 } });

test('on a 360 px phone in French, the Library is no wider than the screen', async ({ page, signIn }) => {
  await signIn();
  // One Piece 56, Glénat: a recorded Catalog answer. The toolbar shows only with a book.
  await quickAdd(page, '9782723478991');
  await expect(page.getByRole('heading', { name: /Which Volumes of One Piece/ })).toBeVisible();

  // French: the longest words of the toolbar row ("Trier et filtrer", "Sélectionner").
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'fr-FR' });
  await page.goto('/library');
  await expect(page.getByRole('link', { name: /^One Piece/ })).toBeVisible();

  const width = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, screen: document.documentElement.clientWidth }));
  expect(width.page).toBe(width.screen);
});
