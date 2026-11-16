import type { Page } from '@playwright/test';
import { keepCookiesWithoutSecure } from './cookies';
import { invite } from './invites';
import { expect, test } from './test';

// The Sign-in Code the dev server mailed last to `address` (/dev/outbox).
async function mailedCode(page: Page, address: string): Promise<string> {
  const mail = await page.request.get(`/dev/outbox?to=${encodeURIComponent(address)}`);
  expect(mail.status()).toBe(200);
  return /\b(\d{6})\b/.exec(await mail.text())![1];
}

const accountId = async (page: Page) => ((await (await page.request.get('/api/session')).json()) as { id: string }).id;

// On the sign-in screen, once its script runs: a submit before it would post the form as a plain GET.
async function signInWithCode(page: Page, address: string) {
  await page.waitForURL(/\/sign-in/, { waitUntil: 'load' });
  await page.getByLabel('Your email address').fill(address);
  await page.getByRole('button', { name: 'Send me a code' }).click();
  await expect(page.getByLabel('Sign-in Code')).toBeVisible();
  await page.getByLabel('Sign-in Code').fill(await mailedCode(page, address));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('An Account made with an AT Protocol Account adds an address, signs out and signs in with a Sign-in Code to the same Library', async ({
  page,
  signIn,
  browserName,
  baseURL,
}) => {
  if (browserName === 'webkit') await keepCookiesWithoutSecure(page, baseURL!);
  const address = `e2e-${browserName}-link@example.org`;
  await signIn();
  const before = await accountId(page);
  await page.goto('/settings');
  const account = page.getByRole('main');
  await expect(account.getByText('Signed in as @test.reader')).toBeVisible();
  // An AT Protocol Account is linked already: no action to link one.
  await expect(account.getByRole('button', { name: 'Link a Bluesky account' })).toBeHidden();

  await account.getByRole('button', { name: 'Add an email address' }).click();
  await page.getByLabel('Your email address').fill(address);
  await page.getByRole('button', { name: 'Send me a code' }).click();
  await expect(page.getByText(`A Sign-in Code is on its way to ${address}.`, { exact: false })).toBeVisible();
  await page.getByLabel('Sign-in Code').fill(await mailedCode(page, address));
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  await expect(page.getByText('Email address added. You can sign in with it now.')).toBeVisible();
  await expect(account.getByText(`Signed in as ${address}`)).toBeVisible();
  await expect(account.getByRole('button', { name: 'Add an email address' })).toBeHidden();

  await account.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('dialog', { name: 'Sign out of this device?' }).getByRole('button', { name: 'Sign out' }).click();
  await signInWithCode(page, address);
  await expect(page).not.toHaveURL(/\/sign-in/);
  expect(await accountId(page)).toBe(before);
});

test('An email Account sees why it cannot share, and the action to link a Bluesky account', async ({ page, browserName, baseURL }) => {
  if (browserName === 'webkit') await keepCookiesWithoutSecure(page, baseURL!);
  const address = `e2e-${browserName}-unlinked@example.org`;
  const token = await invite(page.request);
  await page.goto(`/sign-in#invite=${token}`);
  await expect(page.getByRole('alert')).toHaveText('Invite kept. Sign in to create your account.');
  await signInWithCode(page, address);
  await expect(page).not.toHaveURL(/\/sign-in/);

  await page.goto('/settings');
  await expect(page.getByText(`Signed in as ${address}`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add an email address' })).toBeHidden();
  await page.getByRole('button', { name: 'Link a Bluesky account' }).click();
  await expect(page.getByLabel('Your handle')).toBeVisible();

  const sharing = page.getByRole('region', { name: 'Sharing' });
  await expect(sharing.getByText('To share, link a Bluesky account in Account, above.')).toBeVisible();
  for (const name of ['Reading Statuses', 'Followed Series', 'Labels']) await expect(sharing.getByRole('switch', { name })).toBeDisabled();
  await expect(sharing.getByRole('button', { name: 'Sign in again' })).toHaveCount(0);
});
