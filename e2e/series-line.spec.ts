import { expect, test } from './test';

// The Series card of a Series not followed comes after the answer on the
// result screen (it waits for the Edition Line). "I have it" must not move
// when it comes: a tap aimed at it would land elsewhere.
test('Check a book: "I have it" stays in place when the Series card comes', async ({ page, signIn }) => {
  await signIn();
  // Hold the Edition Line until "I have it" is on screen.
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/catalog/editions/*/volumes', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/check');

  // One Piece 56, Glénat: a recorded Volume of a Series this reader does not follow.
  await page.getByLabel('ISBN', { exact: true }).fill('9782723478991');
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(page.getByText('Not in your Library', { exact: true })).toBeVisible();
  const add = page.getByRole('button', { name: 'I have it' });
  const before = (await add.boundingBox())!;
  release();

  await expect(page.getByText(/You have 0 of 113/)).toBeVisible();
  expect((await add.boundingBox())!.y).toBe(before.y);
});
