import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { afterEach, expect, test, vi } from 'vitest';
import Welcome from './welcome.astro';

// LANDING_PAGE (M12, CORE-158): an instance that turns the Landing page off has no such page.
afterEach(() => {
  vi.unstubAllEnvs();
});

test('the Landing page opens with no session', async () => {
  const container = await AstroContainer.create();

  const response = await container.renderToResponse(Welcome);

  expect(response.status).toBe(200);
  expect(await response.text()).toContain('<h1 id="hero-title"');
});

test('LANDING_PAGE=off: /welcome answers 404', async () => {
  vi.stubEnv('LANDING_PAGE', 'off');
  const container = await AstroContainer.create();

  const response = await container.renderToResponse(Welcome);

  expect(response.status).toBe(404);
});
