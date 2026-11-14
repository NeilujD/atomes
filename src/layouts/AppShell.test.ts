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

// A route of src/pages: `/x` is x.astro, x.ts or x/index.astro. The query does not count.
const hasPage = (href: string) => {
  const path = href.split('?')[0];
  return [`${path.slice(1) || 'index'}.astro`, `${path.slice(1)}.ts`, `${path.slice(1)}/index.astro`].some((file) => existsSync(new URL(file, pages)));
};

const navLinks = (html: string) =>
  (html.match(/<nav[\s\S]*?<\/nav>/g) ?? []).flatMap((nav) => [...nav.matchAll(/href="([^"]*)"/g)].map(([, href]) => href));

test.each(Object.entries(screens))('the %s screen links to Check a book with the camera on, and no nav link leads to a missing screen', async (_, screen) => {
  // Library, To Buy and Series render a Preact island (ADR 0014).
  const container = await AstroContainer.create({ renderers: await loadRenderers([getContainerRenderer()]) });

  const links = navLinks(await container.renderToString(screen));

  // Both the Check tab (phone) and "Check a book" (desktop) open the camera at once (CORE-97).
  expect(links.filter((href) => href.startsWith('/check'))).toEqual(['/check?scan=1', '/check?scan=1']);
  for (const href of links) expect(hasPage(href), href).toBe(true);
});

// The back arrow of a detail page (ui-direction: View header): a link to the
// Library, which a script turns into a step back in history after an Atomes page.
const backLinks = (html: string) => [...html.matchAll(/<a\b[^>]*aria-label="Back"[^>]*>/g)].map(([link]) => link.match(/href="([^"]*)"/)?.[1]);

test.each([
  ['Book', Book, ['/library']],
  ['Series', Series, ['/library']],
  ['Library', Library, []],
  ['To Buy', ToBuy, []],
])('the %s screen has a back arrow only if it is a detail page', async (_, screen, expected) => {
  const container = await AstroContainer.create({ renderers: await loadRenderers([getContainerRenderer()]) });

  expect(backLinks(await container.renderToString(screen))).toEqual(expected);
});
