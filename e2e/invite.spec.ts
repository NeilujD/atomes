import { DatabaseSync } from 'node:sqlite';
import { makeInvite } from '../src/lib/server/invites';
import { expect, test } from './test';

// An Invite in the library.sqlite of the E2E server (playwright.config.ts),
// as `scripts/invite.ts` makes it. A first request makes the server open and
// migrate the file, so only the server ever migrates it.
async function invite(request: { get(url: string): Promise<unknown> }): Promise<string> {
  await request.get('/api/session');
  const db = new DatabaseSync('data-e2e/library.sqlite');
  try {
    return makeInvite(db).token;
  } finally {
    db.close();
  }
}

test('An Invite link is kept for the sign-in, and its token leaves the address', async ({ page, browserName }) => {
  const token = await invite(page.request);

  await page.goto(`/sign-in#invite=${token}`);

  await expect(page.getByRole('alert')).toHaveText('Invite kept. Sign in to create your account.');
  expect(page.url()).not.toContain(token);
  expect(await page.evaluate(() => location.hash)).toBe('');
  // WebKit on Linux (CI) does not keep a Secure cookie of http://127.0.0.1; https instances are fine.
  if (browserName === 'chromium') {
    const kept = (await page.context().cookies('http://127.0.0.1:4322/oauth')).find((cookie) => cookie.name === 'atomes_invite');
    expect(kept).toMatchObject({ httpOnly: true, path: '/oauth', sameSite: 'Lax' });
  }
});

test('A used or unknown Invite link says so', async ({ page }) => {
  await page.goto('/sign-in#invite=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');

  await expect(page.getByRole('alert')).toHaveText('This Invite was used or has expired. Ask the owner of this Atomes server for a new one.');
  expect(page.url()).not.toContain('invite');
});
