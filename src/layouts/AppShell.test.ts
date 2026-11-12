import { existsSync } from 'node:fs';
import { getContainerRenderer } from '@astrojs/preact';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { loadRenderers } from 'astro:container';
import { expect, test } from 'vitest';
import Book from '../pages/book.astro';
import Library from '../pages/library.astro';
import Series from '../pages/series.astro';
import ToBuy from '../pages/to-buy.astro';

const screens = { Library, 'To Buy': ToBuy, Series, Book };
const pages = new URL('../pages/', import.meta.url);

// A route of src/pages: `/x` is x.astro, x.ts or x/index.astro.
const hasPage = (path: string) =>
  [`${path.slice(1) || 'index'}.astro`, `${path.slice(1)}.ts`, `${path.slice(1)}/index.astro`].some((file) => existsSync(new URL(file, pages)));

const navLinks = (html: string) =>
  (html.match(/<nav[\s\S]*?<\/nav>/g) ?? []).flatMap((nav) => [...nav.matchAll(/href="([^"]*)"/g)].map(([, href]) => href));

test.each(Object.entries(screens))('the %s screen links to Check a book, and no nav link leads to a missing screen', async (_, screen) => {
  // Library, To Buy and Series render a Preact island (ADR 0014).
  const container = await AstroContainer.create({ renderers: await loadRenderers([getContainerRenderer()]) });

  const links = navLinks(await container.renderToString(screen));

  expect(links).toContain('/check');
  for (const href of links) expect(hasPage(href), href).toBe(true);
});
