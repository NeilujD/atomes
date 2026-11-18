import type { Locator } from '@playwright/test';
import { expect, quickAdd, test } from './test';

// The background and text colours of `element`, and the colours of the main action tokens, as the browser computes them.
function mainActionColours(element: Locator) {
  return element.evaluate((action) => {
    const probe = (token: string) => {
      const span = document.createElement('span');
      span.style.color = `var(${token})`;
      document.body.append(span);
      const colour = getComputedStyle(span).color;
      span.remove();
      return colour;
    };
    const style = getComputedStyle(action);
    return { fill: style.backgroundColor, text: style.color, accentFill: probe('--accent-fill'), onAccent: probe('--on-accent') };
  });
}

test('Home: Check a book, the filled main action, while the Library is empty, then the book just added under Owned, not read yet', async ({ page, signIn }) => {
  await signIn();
  await page.goto('/');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Type an ISBN' })).toHaveCount(0);
  const check = page.getByRole('main').getByRole('link', { name: 'Check a book' });
  await expect(check).toHaveAttribute('href', '/check');
  const colours = await mainActionColours(check);
  expect(colours.fill).toBe(colours.accentFill);
  expect(colours.text).toBe(colours.onAccent);

  // La Horde du Contrevent: a recorded standalone novel, so no Series Onboarding.
  await quickAdd(page, '9782072927515');
  await expect(page.getByText(/is in your Library/)).toBeVisible();

  await page.goto('/');
  const section = page.getByRole('region', { name: 'Owned, not read yet' });
  await expect(section.getByRole('link', { name: /La Horde du Contrevent/i })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Reading now' })).toHaveCount(0);
  await section.getByRole('link', { name: /La Horde du Contrevent/i }).click();
  await expect(page).toHaveURL(/\/book/);
});
