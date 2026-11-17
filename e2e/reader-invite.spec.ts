import { keepCookiesWithoutSecure } from './cookies';
import { expect, test } from './test';

test('A reader makes an Invite in Settings; a friend signs up with it; then the reader has used their Invite', async ({
  page,
  context,
  browser,
  browserName,
  baseURL,
  signIn,
}) => {
  await signIn();

  // Another site cannot make an Invite with the reader's session.
  const forged = await page.request.post('/api/account/invite', { headers: { origin: 'https://evil.example' } });
  expect(forged.status()).toBe(403);

  await page.goto('/settings');
  const section = page.getByRole('region', { name: 'Invite a friend' });
  await expect(section.getByText('One person can make an Atomes account with your Invite.', { exact: false })).toBeVisible();
  await section.getByRole('button', { name: 'Make an Invite' }).click();

  const link = section.getByLabel('Invite link');
  await expect(link).toHaveValue(/\/sign-in#invite=[A-Za-z0-9_-]{43}$/);
  await expect(section.getByText(/It works one time, for 14 days/)).toBeVisible();
  const cancelled = await link.inputValue();
  if (browserName === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await section.getByRole('button', { name: 'Copy' }).click();
    await expect(page.getByText('Link copied.')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(cancelled);
  }

  // A new link cancels the first one.
  await section.getByRole('button', { name: 'Make a new link' }).click();
  await expect(link).not.toHaveValue(cancelled);
  const sent = await link.inputValue();

  // The friend, on their own device.
  const friend = await browser.newContext({ baseURL });
  const origin = new URL(baseURL!).origin;
  await friend.route((url) => url.origin !== origin, (route) => route.abort('blockedbyclient'));
  const first = await friend.newPage();
  await first.goto(cancelled);
  await expect(first.getByRole('alert')).toHaveText('This Invite was used or has expired. Ask the person who sent it for a new one.');
  await first.close();

  const other = await friend.newPage();
  if (browserName === 'webkit') await keepCookiesWithoutSecure(other, baseURL!);
  await other.goto(sent);
  await expect(other.getByRole('alert')).toHaveText('Invite kept. Sign in to create your account.');
  const address = `e2e-${browserName}-invited@example.org`;
  await other.getByLabel('Your email address').fill(address);
  await other.getByRole('button', { name: 'Send me a code' }).click();
  await expect(other.getByText(`If ${address} may sign in here, a Sign-in Code is on its way.`)).toBeVisible();
  const mail = await other.request.get(`/dev/outbox?to=${encodeURIComponent(address)}`);
  await other.getByLabel('Sign-in Code').fill(/\b(\d{6})\b/.exec(await mail.text())![1]);
  // Signed up: Home.
  await expect(other).toHaveURL(`${origin}/`);
  await expect(other.getByRole('heading', { name: 'Sign in to Atomes' })).toHaveCount(0);
  await friend.close();

  await page.reload();
  await expect(section.getByText('You have used your Invite: a person made an account with it.')).toBeVisible();
  await expect(section.getByRole('button')).toHaveCount(0);
  expect((await page.request.post('/api/account/invite', { headers: { origin } })).status()).toBe(403);
});
