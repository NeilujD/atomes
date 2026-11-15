import type { Locator } from '@playwright/test';
import { expect, test } from './test';

// The text colour of an action, and the colour a theme token paints, as the
// browser computes them (ui-direction: colour roles).
async function colourRole(action: Locator, token: '--accent' | '--danger' | '--ink') {
  return action.evaluate((element, token) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${token})`;
    document.body.append(probe);
    const colours = { action: getComputedStyle(element).color, token: getComputedStyle(probe).color };
    probe.remove();
    return colours;
  }, token);
}

async function expectRole(action: Locator, token: '--accent' | '--danger' | '--ink') {
  await expect(action).toBeVisible();
  const { action: colour, token: expected } = await colourRole(action, token);
  expect(colour, `${token} on the action`).toBe(expected);
}

test('Cobalt marks the primary action of each screen; the muted red marks Remove a Copy', async ({ page, signIn }) => {
  await signIn();

  // Check a book, for a book the reader does not own: Add to Library is the primary action.
  // One Piece 56, Glénat: a recorded Catalog answer.
  await page.goto('/check');
  await page.getByLabel('ISBN', { exact: true }).fill('9782723478991');
  await page.getByRole('button', { name: 'Look up' }).click();
  await expectRole(page.getByRole('button', { name: 'Add to Library' }), '--accent');
  await page.getByRole('button', { name: 'Add to Library' }).click();

  // Series Onboarding: Save.
  await expect(page.getByText('Do you own Volumes 1–55?')).toBeVisible();
  await expectRole(page.getByRole('button', { name: 'Save', exact: true }), '--accent');
  await page.getByRole('link', { name: 'Skip' }).click();

  // The Book page: Remove a Copy destroys.
  await expect(page).toHaveURL(/\/book/);
  await expectRole(page.getByRole('button', { name: 'Remove' }), '--danger');

  // The Series page, not followed: Follow.
  await page.goto('/series?isbn=9782723478991');
  await expectRole(page.getByRole('button', { name: 'Follow', exact: true }), '--accent');

  // Check a book, for a book the reader owns: Add another Copy is secondary, in ink.
  await page.goto('/check');
  await page.getByLabel('ISBN', { exact: true }).fill('9782723478991');
  await page.getByRole('button', { name: 'Look up' }).click();
  await expectRole(page.getByRole('button', { name: 'Add another Copy' }), '--ink');

  // To Buy: the "+" that adds a book, and Add in its sheet.
  await page.goto('/to-buy');
  await expectRole(page.getByRole('button', { name: 'Add a book' }), '--accent');
  await page.getByRole('button', { name: 'Add a book' }).click();
  await expectRole(page.getByRole('dialog', { name: 'Add a book by its ISBN' }).getByRole('button', { name: 'Add', exact: true }), '--accent');
});
