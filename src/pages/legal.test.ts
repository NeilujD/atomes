import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { afterEach, expect, test, vi } from 'vitest';
import Legal from './legal.astro';

// The Legal notice names the publisher and the host of this instance, from its
// own settings: a self-hosted instance never names those of another (LEGAL_*).
afterEach(() => {
  vi.unstubAllEnvs();
});

const render = async () => {
  const container = await AstroContainer.create();
  return (await container.renderToResponse(Legal, { request: new Request('http://127.0.0.1:4321/legal', { headers: { 'accept-language': 'en' } }) })).text();
};

test('the Legal notice names the publisher, their contact and the host the instance gives', async () => {
  vi.stubEnv('LEGAL_PUBLISHER', ' Ada Lovelace ');
  vi.stubEnv('LEGAL_CONTACT', 'ada@example.org');
  vi.stubEnv('LEGAL_HOST', 'Example Hosting SAS, 1 rue de l’Exemple, 75001 Paris, +33 1 00 00 00 00');

  const html = await render();

  expect(html).toContain('Ada Lovelace publishes this Atomes instance');
  expect(html).toContain('Contact: ada@example.org.');
  expect(html).toContain('Example Hosting SAS, 1 rue de l’Exemple, 75001 Paris, +33 1 00 00 00 00');
});

test('an instance that gives none says which settings are missing, and names nobody', async () => {
  vi.stubEnv('LEGAL_PUBLISHER', '');
  vi.stubEnv('LEGAL_CONTACT', '');
  vi.stubEnv('LEGAL_HOST', '');

  const html = await render();

  expect(html).toContain('Not given yet by the operator of this instance (LEGAL_PUBLISHER, LEGAL_CONTACT).');
  expect(html).toContain('Not given yet by the operator of this instance (LEGAL_HOST).');
  expect(html).not.toContain('Julien Collard');
  expect(html).not.toContain('@gmail.com');
});
