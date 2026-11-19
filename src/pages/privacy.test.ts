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
