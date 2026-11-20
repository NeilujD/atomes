import { adminRole } from './admins';
import { readerDid } from './readers';
import { expect, test } from './test';

// The admin panel (ADR 0020, M13). Chromium and WebKit run this journey at the
// same time on one server: each names what it made (a label, an address).
test('An Admin makes Invites, adds an Account, shows its identity, deletes it and reads the Admin Log; a reader gets a 404', async ({
  page,
  browserName,
  baseURL,
  signIn,
}, testInfo) => {
  const did = readerDid(testInfo.project.name, testInfo.file);
  // As the browser sends it with a write of a page of the app.
  const origin = new URL(baseURL!).origin;
  await signIn();

  // A reader: no panel, no admin API, no link in Settings.
  expect((await page.goto('/admin'))!.status()).toBe(404);
  expect((await page.request.get('/api/admin/accounts')).status()).toBe(404);
  expect((await page.request.post('/api/admin/invites', { data: { count: 1 }, headers: { origin } })).status()).toBe(404);
  await page.goto('/settings');
  await expect(page.getByRole('button', { name: 'Sign out' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Admin panel' })).toHaveCount(0);

  // The operator grants the role with the script; the open session is an Admin at its next request.
  await adminRole(page.request, 'grant', did);
  await page.goto('/settings');
  await page.getByRole('link', { name: 'Admin panel' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Admin panel' })).toBeVisible();

  // Another site cannot act with the Admin's session.
  expect((await page.request.post('/api/admin/invites', { data: { count: 1 }, headers: { origin: 'https://evil.example' } })).status()).toBe(403);

  // From one part to another, the panel does not fade out and in (a blink): the page transition is
  // skipped, or the browser has none. Read on the new page, when it shows.
  await page.addInitScript(() => {
    addEventListener('pagereveal', (event) => {
      const transition = (event as Event & { viewTransition: { ready: Promise<void> } | null }).viewTransition;
      const state = (value: string) => sessionStorage.setItem('e2e-transition', value);
      if (!transition) return state('none');
      void transition.ready.then(
        () => state('ran'),
        () => state('skipped'),
      );
    });
  });

  // Invites: two, with a label; the links show once.
  const label = `E2E ${browserName}`;
  await page.getByRole('link', { name: 'Invites', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Make Invites' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('e2e-transition'))).toMatch(/^(skipped|none)$/);
  await page.getByLabel('How many').fill('2');
  await page.getByLabel('Label (optional)').fill(label);
  await page.getByRole('button', { name: 'Make Invites' }).click();
  await expect(page.getByText(`2 Invites made · ${label}`)).toBeVisible();
  await expect(page.getByText('These links show once.', { exact: false })).toBeVisible();
  const links = page.getByLabel(/^Link of Invite [0-9A-F]{6}$/);
  await expect(links).toHaveCount(2);
  for (const link of await links.all()) await expect(link).toHaveValue(/\/sign-in#invite=[A-Za-z0-9_-]{43}$/);
  const made = page.locator('.rows.invites tbody', { hasText: label });
  await expect(made).toHaveCount(2);
  // The state shows once on a phone; the table of a wide screen has its own cell for it.
  await expect(made.first().locator('.state:visible')).toHaveText('Open');
  // A link and its row in the list carry the same tag.
  const tag = await page.locator('[data-made-tag]').first().innerText();
  const tagged = made.filter({ hasText: tag });
  await expect(tagged).toHaveCount(1);

  // A second make asks first: the links on the page would go.
  await page.getByRole('button', { name: 'Make Invites' }).click();
  await page.getByRole('dialog', { name: 'Make new Invites?' }).getByRole('button', { name: 'Cancel' }).click();
  await expect(links).toHaveCount(2);

  // A revoke names the Invite by its tag, and its link on the page stops looking usable.
  await tagged.getByRole('button', { name: `Revoke Invite ${tag}` }).click();
  await page.getByRole('dialog', { name: `Revoke Invite ${tag}?` }).getByRole('button', { name: 'Revoke' }).click();
  await expect(made).toHaveCount(1);
  await expect(page.getByRole('button', { name: `Copy Invite ${tag}` })).toBeDisabled();

  // Accounts: add one by its email address; the person gets one mail.
  const address = `e2e-${browserName}-added@example.org`;
  await page.getByRole('link', { name: 'Accounts', exact: true }).click();
  await page.getByRole('button', { name: 'Add an Account' }).click();
  const form = page.getByRole('form', { name: 'Add an Account' });
  await form.getByLabel('Email address').fill(address);
  await form.getByRole('button', { name: 'Add the Account' }).click();
  const added = page.getByText(/Account A-[A-Z2-7]{6,8} added\. The mail went\./);
  await expect(added).toBeVisible();
  const reference = /A-[A-Z2-7]{6,8}/.exec(await added.innerText())![0];
  // The panel leads to the new row.
  await expect(page).toHaveURL(new RegExp(`#${reference}$`));
  const mail = await page.request.get(`/dev/outbox?to=${encodeURIComponent(address)}`);
  expect(await mail.text()).toContain('An Admin of this Atomes instance made an Account for you');

  // The Admin's own row says "you", and has no Delete.
  const own = page.locator('.rows.accounts tbody', { has: page.locator('.chip', { hasText: /^you$/ }) });
  await expect(own).toHaveCount(1);
  await expect(own.getByRole('button', { name: /^Delete/ })).toHaveCount(0);

  // It is in the list, by its Account Reference, with no address.
  const row = page.locator(`[data-reference="${reference}"]`);
  await expect(row.getByText('Added by an Admin')).toBeVisible();
  await expect(page.getByText(address)).toHaveCount(0);

  // Its identity shows after a reason, and only then.
  await row.getByRole('button', { name: 'Show identity' }).click();
  const identity = page.getByRole('dialog', { name: `Show identity of ${reference}` });
  // Enter in the field confirms: Cancel is not the default button of the form.
  await identity.getByLabel('Reason').fill('E2E journey of the admin panel');
  await identity.getByLabel('Reason').press('Enter');
  await expect(row.getByText(address)).toBeVisible();
  await page.reload();
  await expect(row).toBeVisible();
  await expect(page.getByText(address)).toHaveCount(0);

  // Delete it: the Admin types its Account Reference.
  await row.getByRole('button', { name: 'Delete' }).click();
  const remove = page.getByRole('dialog', { name: `Delete Account ${reference}?` });
  await expect(remove.getByRole('button', { name: 'Delete the Account' })).toBeDisabled();
  await remove.getByLabel(`Type ${reference} to confirm`).fill(reference);
  await remove.getByLabel(`Type ${reference} to confirm`).press('Enter');
  await expect(page.getByText(`Account ${reference} deleted.`)).toBeVisible();
  await expect(row).toHaveCount(0);

  // The Admin Log has a line for each action; it still names the deleted Account by its Account Reference.
  await page.getByRole('link', { name: 'Log', exact: true }).click();
  const line = (action: string) => page.locator('.rows.log tbody', { hasText: action }).filter({ hasText: reference });
  await expect(line('Deleted an Account')).toHaveCount(1);
  await expect(line('Showed identity')).toContainText('E2E journey of the admin panel');
  await expect(line('Added an Account')).toHaveCount(1);
  await expect(page.locator('.rows.log tbody', { hasText: 'Made Invites' }).filter({ hasText: `2 · ${label}` })).toHaveCount(1);
  await expect(page.getByText(address)).toHaveCount(0);

  // A revoke works at once, with the session still open.
  await adminRole(page.request, 'revoke', did);
  expect((await page.goto('/admin'))!.status()).toBe(404);
});
