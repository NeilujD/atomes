import type { Locator } from '@playwright/test';
import { expect, test } from './test';

// The colour of an action, and the colour a theme token paints, as the
// browser computes them (ui-direction: colour roles).
type Token = '--accent' | '--accent-fill' | '--on-accent' | '--danger' | '--ink' | '--line-button' | '--not-owned' | '--on-ownership';
type Property = 'color' | 'backgroundColor' | 'borderTopColor';

async function colourRole(action: Locator, token: Token, property: Property) {
  return action.evaluate(
    (element, [token, property]) => {
      const probe = document.createElement('span');
      probe.style.color = `var(${token})`;
      document.body.append(probe);
      const colours = { action: getComputedStyle(element)[property], token: getComputedStyle(probe).color };
      probe.remove();
      return colours;
    },
    [token, property] as const,
  );
}

async function expectRole(action: Locator, token: Token, property: Property = 'color') {
  await expect(action).toBeVisible();
  const { action: colour, token: expected } = await colourRole(action, token, property);
  expect(colour, `${token} on the action (${property})`).toBe(expected);
}

// The one main action of a screen: filled cobalt, in light text (CORE-122).
async function expectMainAction(action: Locator) {
  await expectRole(action, '--accent-fill', 'backgroundColor');
  await expectRole(action, '--on-accent');
}

// A secondary button: no fill, a line of ink, text in the screen's text colour (CORE-122).
async function expectSecondary(action: Locator, text: Token = '--ink') {
  await expectRole(action, text);
  await expectRole(action, '--line-button', 'borderTopColor');
  await expect(action).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
}

test('Cobalt fills the main action of each screen, green and orange the Shelf Check result; the muted red marks Remove a Copy', async ({ page, signIn }) => {
  await signIn();

  // The Shelf Check result, for a book the reader does not own: Add to Library is filled green, in dark text.
  // One Piece 56, Glénat: a recorded Catalog answer.
  await page.goto('/check');
  await page.getByLabel('ISBN', { exact: true }).fill('9782723478991');
  await page.getByRole('button', { name: 'Look up' }).click();
  const add = page.getByRole('dialog', { name: 'Shelf Check' }).getByRole('button', { name: 'Add to Library' });
  await expectRole(add, '--not-owned', 'backgroundColor');
  await expectRole(add, '--on-ownership');
  await add.click();

  // Series Onboarding: Save.
  await expect(page.getByText('Do you own Volumes 1–55?')).toBeVisible();
  await expectMainAction(page.getByRole('button', { name: 'Save', exact: true }));
  await page.getByRole('link', { name: 'Skip' }).click();

  // The Book page: Remove a Copy destroys.
  await expect(page).toHaveURL(/\/book/);
  await page.getByRole('button', { name: 'More actions for the Copy with ISBN 9782723478991' }).click();
  await expectRole(page.getByRole('button', { name: 'Remove the Copy with ISBN 9782723478991' }), '--danger');
  await page.keyboard.press('Escape');

  // The Series page, not followed: Follow.
  await page.goto('/series?isbn=9782723478991');
  await expectMainAction(page.getByRole('button', { name: 'Follow', exact: true }));

  // The Shelf Check result, for a book the reader owns: Add another Copy is secondary, in the screen's text colour.
  await page.goto('/check');
  await page.getByLabel('ISBN', { exact: true }).fill('9782723478991');
  await page.getByRole('button', { name: 'Look up' }).click();
  await expectRole(page.getByRole('dialog', { name: 'Shelf Check' }).getByRole('button', { name: 'Add another Copy' }), '--ink');

  // To Buy: the "+" that adds a book, and Add in its sheet.
  await page.goto('/to-buy');
  await expectRole(page.getByRole('button', { name: 'Add a book' }), '--accent');
  await page.getByRole('button', { name: 'Add a book' }).click();
  await expectMainAction(page.getByRole('dialog', { name: 'Add a book by its ISBN' }).getByRole('button', { name: 'Add', exact: true }));
  await page.keyboard.press('Escape');

  // Settings has no main action at rest: Export is a secondary button. The
  // confirm of Delete my account: Cancel secondary, Delete in the muted red.
  await page.goto('/settings');
  await expectSecondary(page.getByRole('link', { name: 'Export my Library' }));
  await page.getByRole('button', { name: 'Delete my account' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete your account?' });
  await expectSecondary(confirm.getByRole('button', { name: 'Cancel' }));
  await expectSecondary(confirm.getByRole('button', { name: 'Delete my account' }), '--danger');
});
