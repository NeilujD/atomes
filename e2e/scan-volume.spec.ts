import { expect, quickAdd, test } from './test';

// A Volume the Catalog lacks: the reader types its ISBN in its sheet (the
// camera needs a phone), in Series Onboarding and on the Series page
// (CORE-108). A Series Correction serves every reader of the server: each
// browser fills its own gaps of the Dragon Ball 1993 Edition Line, which no
// other journey opens, with recorded books that no other journey uses, and
// asks for the Correction to be undone at the end.
const runs = {
  chromium: { range: 'Volumes 1–10', tapped: 3, inOnboarding: 5, onSeriesPage: 6, books: ['9781408730218', '9782864976165'] },
  webkit: { range: 'Volumes 21–30', tapped: 22, inOnboarding: 24, onSeriesPage: 25, books: ['9782505009566', '9782723467681'] },
};

test('Dragon Ball 2: scan an unknown Volume in Series Onboarding, the taps stay; then another on the Series page, and the Missing list counts it', async ({ page, signIn }, testInfo) => {
  test.slow();
  const run = runs[testInfo.project.name as keyof typeof runs];
  const [first, second] = run.books;
  await signIn();
  // Dragon Ball 2, Glénat, 1993: recorded; its Edition Line has no 5, 6, 7, 24, 25 or 26.
  await quickAdd(page, '9782876952065');
  await expect(page.getByText('Do you own Volume 1?')).toBeVisible();
  await page.getByRole('button', { name: 'Yes' }).click();
  await page.getByRole('button', { name: 'Up to 42' }).click();
  if (run.range !== 'Volumes 1–10') await page.getByText(run.range).click();
  // An earlier tap: this Volume is not owned.
  await page.getByRole('button', { name: new RegExp(`^Volume ${run.tapped}, owned`) }).click();
  await expect(page.getByRole('button', { name: new RegExp(`^Volume ${run.tapped}, missing`) })).toBeVisible();

  await page.getByRole('button', { name: `Volume ${run.inOnboarding}, not in the Catalog yet` }).click();
  const onboardingSheet = page.getByRole('dialog', { name: `Add Volume ${run.inOnboarding} to the Catalog` });
  await onboardingSheet.getByLabel('ISBN').fill(first);
  await onboardingSheet.getByRole('button', { name: `Add Volume ${run.inOnboarding}` }).click();

  await expect(page.getByText(`Volume ${run.inOnboarding} joins the Edition Line. Every reader sees it.`)).toBeVisible();
  await expect(onboardingSheet).toBeHidden();
  // A normal tile now, owned with the range; the earlier tap is still there.
  await expect(page.getByRole('button', { name: new RegExp(`^Volume ${run.inOnboarding}, owned`) })).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(`^Volume ${run.tapped}, missing`) })).toBeVisible();

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  // 35 Copies to save.
  await expect(page).toHaveURL(/\/series\?isbn=9782876952065/, { timeout: 15_000 });
  const missing = page.getByRole('region', { name: 'Missing Volumes' });
  await expect(missing.getByRole('listitem').filter({ hasText: new RegExp(`^${run.tapped}$`) })).toBeVisible();
  await expect(missing.getByRole('listitem').filter({ hasText: new RegExp(`^${run.inOnboarding}$`) })).toHaveCount(0);

  await missing.getByRole('button', { name: `Volume ${run.onSeriesPage}, not in the Catalog yet` }).click();
  const seriesSheet = page.getByRole('dialog', { name: `Add Volume ${run.onSeriesPage} to the Catalog` });
  await seriesSheet.getByLabel('ISBN').fill(second);
  await seriesSheet.getByRole('button', { name: `Add Volume ${run.onSeriesPage}` }).click();

  await expect(page.getByText(`Volume ${run.onSeriesPage} joins the Edition Line. Every reader sees it.`)).toBeVisible();
  // In the Edition Line and Missing: listed, no longer hatched.
  await expect(missing.getByRole('button', { name: `Volume ${run.onSeriesPage}, not in the Catalog yet` })).toBeHidden();
  await expect(missing.getByRole('listitem').filter({ hasText: new RegExp(`^${run.onSeriesPage}$`) })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Volumes' }).getByRole('button', { name: `Volume ${run.onSeriesPage}: not owned` })).toBeVisible();

  // From the page: the server refuses a write with no Origin.
  const undo = (isbn: string) => fetch(`/api/catalog/editions/${isbn}/correction`, { method: 'DELETE' }).then(({ status }) => status);
  for (const isbn of run.books) expect(await page.evaluate(undo, isbn)).toBe(200);
});
