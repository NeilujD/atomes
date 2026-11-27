import { readFileSync } from 'node:fs';
import { expect, test } from './test';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

// What's new (/changelog): the GitHub Releases, cut into categories. The E2E
// server answers with the recorded Releases (CHANGELOG_SOURCE=recorded,
// src/lib/server/changelog.fake.ts): the real v1.0.0, a sample v1.1.0
// with every category, and an empty Release of the package.json version
// when it is not one of them (a release PR bumps it).

test('A reader opens What’s new from Settings, reads each category, and comes back', async ({ page, signIn }) => {
  await signIn();
  await page.goto('/settings');
  await page.getByRole('region', { name: 'About' }).getByRole('link', { name: 'What’s new' }).click();
  await expect(page).toHaveURL(/\/changelog$/);
  await expect(page.getByRole('heading', { name: 'What’s new', level: 1 })).toBeVisible();

  const sample = page.getByRole('region', { name: 'Version 1.1.0' });
  for (const category of ['Breaking changes', 'New features', 'Improvements', 'Fixes', 'Maintenance']) {
    await expect(sample.getByRole('heading', { name: category, level: 3 })).toBeVisible();
  }
  // A breaking change keeps its Migration part; each change links its pull request.
  await expect(sample.getByText('Migration', { exact: true })).toBeVisible();
  await expect(sample.getByRole('link', { name: 'Pull request #101' })).toHaveAttribute('href', 'https://github.com/NeilujD/atomes/pull/101');
  // The version this server runs is marked.
  await expect(page.getByRole('region', { name: `Version ${version}` }).getByText('On this instance')).toBeVisible();

  await page.getByRole('link', { name: 'Close' }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test('A visitor opens What’s new from the Landing page footer, in French, with no session', async ({ page, baseURL }) => {
  await page.context().addCookies([{ name: 'atomes-language', value: 'fr', url: baseURL! }]);
  await page.goto('/welcome');
  await page.getByRole('contentinfo').getByRole('link', { name: 'Nouveautés' }).click();
  await expect(page).toHaveURL(/\/changelog$/);
  await expect(page.getByRole('heading', { name: 'Nouveautés', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Corrections', level: 3 })).toBeVisible();
  // No gate sends the visitor away once the page scripts have run.
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/\/changelog$/);
  await page.getByRole('link', { name: 'Fermer' }).click();
  await expect(page).toHaveURL(/\/welcome$/);
});
