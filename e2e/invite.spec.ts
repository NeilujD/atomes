import { invite } from './invites';
import { expect, test } from './test';

test('An Invite link is kept for the sign-in, and its token leaves the address', async ({ page, browserName }) => {
  const token = await invite(page.request);

  await page.goto(`/sign-in#invite=${token}`);

  await expect(page.getByRole('alert')).toHaveText('Invite kept. Sign in to create your account.');
  expect(page.url()).not.toContain(token);
  expect(await page.evaluate(() => location.hash)).toBe('');
  // WebKit on Linux (CI) does not keep a Secure cookie of http://127.0.0.1; https instances are fine.
  if (browserName === 'chromium') {
    const kept = (await page.context().cookies('http://127.0.0.1:4322/')).find((cookie) => cookie.name === 'atomes_invite');
    expect(kept).toMatchObject({ httpOnly: true, path: '/', sameSite: 'Lax' });
  }
});

test('A used or unknown Invite link says so', async ({ page }) => {
  await page.goto('/sign-in#invite=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');

  await expect(page.getByRole('alert')).toHaveText('This Invite was used or has expired. Ask the owner of this Atomes server for a new one.');
  expect(page.url()).not.toContain('invite');
});
