import { getContainerRenderer } from '@astrojs/preact';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { loadRenderers } from 'astro:container';
import { expect, test } from 'vitest';
import Index from './index.astro';

// Home renders a Preact island (ADR 0014); its sections are tested in src/islands/Home.test.tsx.
const createContainer = async () => AstroContainer.create({ renderers: await loadRenderers([getContainerRenderer()]) });

test('home page renders in the app shell with Home as the current page', async () => {
  const container = await createContainer();

  const html = await container.renderToString(Index);

  expect(html).toContain('<title>Home · Atomes</title>');
  const current = html.match(/<a[^>]*aria-current="page"[^>]*>/g) ?? [];
  expect(current.length).toBeGreaterThan(0);
  expect(current.every((link) => link.includes('href="/"'))).toBe(true);
});

test('home page renders in the language of the request', async () => {
  const container = await createContainer();
  const render = (headers: Record<string, string>) =>
    container.renderToString(Index, { request: new Request('http://127.0.0.1:4321/', { headers }) });

  const french = await render({ 'accept-language': 'fr-FR,fr;q=0.9' });
  expect(french).toContain('<html lang="fr"');
  expect(french).toContain('<title>Accueil · Atomes</title>');

  const chosen = await render({ 'accept-language': 'fr-FR', cookie: 'atomes-language=en' });
  expect(chosen).toContain('<html lang="en"');
  expect(chosen).toContain('<title>Home · Atomes</title>');
});
