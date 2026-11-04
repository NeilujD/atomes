import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { expect, test } from 'vitest';
import Index from './index.astro';

test('home page renders in the app shell with Home as the current page', async () => {
  const container = await AstroContainer.create();

  const html = await container.renderToString(Index);

  expect(html).toContain('<title>Home · Atomes</title>');
  const current = html.match(/<a[^>]*aria-current="page"[^>]*>/g) ?? [];
  expect(current.length).toBeGreaterThan(0);
  expect(current.every((link) => link.includes('href="/"'))).toBe(true);
});
