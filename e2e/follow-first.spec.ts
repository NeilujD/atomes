import { expect, test } from './test';

// A follow made on Check a book before any Volume is in the Library says
// nothing of the Volumes owned: "I have it" still opens Series Onboarding.

test('Follow on Check a book, then "I have it": Series Onboarding still asks which Volumes the reader owns', async ({ page, signIn }) => {
  await signIn();
  // One Piece 56, Glénat: a Series this reader does not follow, with no Volume in the Library.
  await page.goto('/check');
  await page.getByLabel('ISBN', { exact: true }).fill('9782723478991');
  await page.getByRole('button', { name: 'Look up' }).click();
  await page.getByRole('button', { name: 'Follow' }).click();
  await expect(page.getByRole('button', { name: 'Follow' })).toBeHidden();

  await page.getByRole('button', { name: 'I have it' }).click();
  await expect(page.getByText('Do you own Volumes 1–55?')).toBeVisible();
});
