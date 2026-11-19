import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { afterEach, expect, test, vi } from 'vitest';
import Privacy from './privacy.astro';

// The Privacy notice names the operator of this instance and their contact,
// from its own settings (LEGAL_PUBLISHER, LEGAL_CONTACT, as the Legal notice).
afterEach(() => {
  vi.unstubAllEnvs();
});

const render = async () => {
  const container = await AstroContainer.create();
  return (await container.renderToResponse(Privacy, { request: new Request('http://127.0.0.1:4321/privacy', { headers: { 'accept-language': 'en' } }) })).text();
};

test('the Privacy notice names the operator and the contact the instance gives', async () => {
  vi.stubEnv('LEGAL_PUBLISHER', 'Ada Lovelace');
  vi.stubEnv('LEGAL_CONTACT', 'ada@example.org');

  const html = await render();

  expect(html).toContain('This instance is run by Ada Lovelace.');
  expect(html).toContain('Contact: ada@example.org.');
  expect(html).toContain('For any other request, write to the contact above.');
});

test('an instance that gives no operator says which settings are missing, and names nobody', async () => {
  vi.stubEnv('LEGAL_PUBLISHER', '');
  vi.stubEnv('LEGAL_CONTACT', '');

  const html = await render();

  expect(html).toContain('Not given yet by the operator of this instance (LEGAL_PUBLISHER, LEGAL_CONTACT).');
  expect(html).not.toContain('Julien Collard');
  expect(html).not.toContain('@gmail.com');
});

// The processors (CORE-165): settings of the instance, and backups only where it has them.
test('with backups, the Privacy notice names the mail sender and the backup storage, and says backups keep the Library 30 days', async () => {
  vi.stubEnv('PRIVACY_MAIL_PROCESSOR', 'Mailer SAS (Lyon, France)');
  vi.stubEnv('BACKUP_S3_ENDPOINT', 'https://s3.example.org');
  vi.stubEnv('PRIVACY_BACKUP_PROCESSOR', 'Example Storage (EU)');

  const html = await render();

  expect(html).toContain('Mailer SAS (Lyon, France) sends your Sign-in Codes');
  expect(html).toContain('an encrypted copy of the Library is sent to Example Storage (EU), and kept for 30 days.');
  expect(html).toContain('The encrypted backups still hold it for up to 30 days.');
});

test('with no backups, no copy leaves the server, and the notice says nothing of backups', async () => {
  vi.stubEnv('PRIVACY_MAIL_PROCESSOR', 'Mailer SAS (Lyon, France)');
  vi.stubEnv('BACKUP_S3_ENDPOINT', '');
  vi.stubEnv('PRIVACY_BACKUP_PROCESSOR', 'Example Storage (EU)');

  const html = await render();

  expect(html).toContain('No copy of the Library leaves the server of this instance.');
  expect(html).not.toContain('Example Storage');
  expect(html).not.toContain('30 days');
});

test('with backups but no processor named, the notice says which settings are missing, and names no provider', async () => {
  vi.stubEnv('PRIVACY_MAIL_PROCESSOR', '');
  vi.stubEnv('BACKUP_S3_ENDPOINT', 'https://s3.example.org');
  vi.stubEnv('PRIVACY_BACKUP_PROCESSOR', '');

  const html = await render();

  expect(html).toContain('Not given yet by the operator of this instance (PRIVACY_MAIL_PROCESSOR).');
  expect(html).toContain('Not given yet by the operator of this instance (PRIVACY_BACKUP_PROCESSOR).');
  expect(html).not.toContain('Scaleway');
  expect(html).not.toContain('Cloudflare');
});
