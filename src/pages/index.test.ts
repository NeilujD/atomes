import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { expect, test } from 'vitest';
import Index from './index.astro';

test('home page shows the app name', async () => {
  const container = await AstroContainer.create();

  const html = await container.renderToString(Index);

  expect(html).toContain('<h1>Atomes</h1>');
});
