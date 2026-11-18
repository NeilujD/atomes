import { keepCookiesWithoutSecure } from './cookies';
import { invite } from './invites';
import { expect, test } from './test';

test('A new reader opens an Invite, signs in with a Sign-in Code from the dev outbox, and lands on the Library', async ({
  page,
  browserName,
  baseURL,
}) => {
  if (browserName === 'webkit') await keepCookiesWithoutSecure(page, baseURL!);
  // One reader per browser: both run at the same time on one server.
  const address = `e2e-${browserName}-email@example.org`;
  const token = await invite(page.request);

  await page.goto(`/sign-in?next=%2Flibrary#invite=${token}`);
  await expect(page.getByRole('alert')).toHaveText('Invite kept. Sign in to create your account.');
  // The words of the AT Protocol sign-in stay behind its action.
  await expect(page.getByText(/PDS|handle|DID/).filter({ visible: true })).toHaveCount(0);

  await page.getByLabel('Your email address').fill(` ${address.toUpperCase()} `);
  await page.getByRole('button', { name: 'Send me a code' }).click();
  await expect(page.getByText(`If ${address} may sign in here, a Sign-in Code is on its way.`)).toBeVisible();

  const mail = await page.request.get(`/dev/outbox?to=${encodeURIComponent(address)}`);
  expect(mail.status()).toBe(200);
  const code = /\b(\d{6})\b/.exec(await mail.text())![1];

  const field = page.getByLabel('Sign-in Code');
  await expect(field).toHaveAttribute('inputmode', 'numeric');
  await expect(field).toHaveAttribute('autocomplete', 'one-time-code');
  // As pasted from a mail, with spaces around: a whole code signs in with no click.
  await field.fill(` ${code.slice(0, 3)} ${code.slice(3)} `);

  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole('heading', { name: 'Sign in to Atomes' })).toHaveCount(0);
});

test('A wrong code says so, the mark shows the request, and the AT Protocol sign-in is the second action', async ({
  page,
  context,
  browserName,
}) => {
  await page.goto('/sign-in');
  // The mark tells the state of its card (Mark.astro, ui-direction: Flow).
  const card = page.getByRole('region', { name: 'Sign in to Atomes' });
  await expect(card).toHaveAttribute('data-state', 'ready');

  // The code request waits until the test lets it go: the mark works meanwhile.
  let answer!: () => void;
  const answered = new Promise<void>((resolve) => (answer = resolve));
  await page.route('**/api/sign-in/code', async (route) => {
    await answered;
    await route.continue();
  });
  await page.getByLabel('Your email address').fill('nobody@example.org');
  await page.getByRole('button', { name: 'Send me a code' }).click();
  await expect(card).toHaveAttribute('data-state', 'working');
  answer();
  // An address with no Account gets the same answer, and no mail.
  await expect(page.getByText('If nobody@example.org may sign in here, a Sign-in Code is on its way.')).toBeVisible();
  await expect(card).toHaveAttribute('data-state', 'done');
  expect((await page.request.get('/dev/outbox?to=nobody%40example.org')).status()).toBe(404);

  await page.getByLabel('Sign-in Code').fill('123456');
  await expect(page.getByRole('alert')).toHaveText('This code is wrong or has expired. Check it, or ask for a new one.');
  await expect(card).toHaveAttribute('data-state', 'failed');

  // Only Chromium lets Playwright grant the clipboard permission.
  if (browserName === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.evaluate(() => navigator.clipboard.writeText('No code in this text'));
    await page.getByRole('button', { name: 'Paste the code' }).click();
    await expect(page.getByRole('alert')).toHaveText('No 6-digit code was copied. Copy the code from the email, or type it.');

    await page.getByLabel('Sign-in Code').fill('');
    await page.evaluate(() => navigator.clipboard.writeText('Your sign-in code for Atomes:\n\n654 321\n'));
    await page.getByRole('button', { name: 'Paste the code' }).click();
    await expect(page.getByLabel('Sign-in Code')).toHaveValue('654321');
    await expect(page.getByRole('alert')).toHaveText('This code is wrong or has expired. Check it, or ask for a new one.');
  }

  await page.getByRole('button', { name: 'Bluesky or another AT Protocol account' }).click();
  await expect(page.getByLabel('Your handle')).toBeVisible();
});
