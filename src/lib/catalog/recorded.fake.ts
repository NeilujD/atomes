// Source answers saved in `fixtures/`, so tests never call a real book
// database. `scripts/record-catalog-answers.ts` writes them from real calls.
// A URL with no saved answer gets 404, the way the sources say "unknown".
import { existsSync, readFileSync } from 'node:fs';
import type { SourceFetch } from './sources';

export const fixtureDir = new URL('./fixtures/', import.meta.url);

export function fixtureName(url: string): string {
  const { host, pathname, searchParams } = new URL(url);
  if (host === 'catalogue.bnf.fr') return `bnf-${/"(\d+)"/.exec(searchParams.get('query') ?? '')?.[1]}.xml`;
  if (host === 'www.sudoc.fr' && pathname.startsWith('/services/isbn2ppn/'))
    return `sudoc-isbn2ppn-${pathname.split('/')[3].split('&')[0]}.json`;
  if (host === 'www.sudoc.fr') return `sudoc-${pathname.slice(1)}`;
  if (host === 'inventaire.io') return `inventaire-${searchParams.get('uris')?.replace(':', '-')}.json`;
  if (host === 'openlibrary.org') return `openlibrary-${searchParams.get('isbn')}.json`;
  throw new Error(`No fixture name for ${url}`);
}

// `down`: hosts that answer 503, to test a source outage. `calls` lists every URL asked.
export function recordedFetch(down: string[] = []) {
  const calls: string[] = [];
  const fetch: SourceFetch = (url) => {
    calls.push(url);
    if (down.includes(new URL(url).host)) return Promise.resolve(new Response('down', { status: 503 }));
    const file = new URL(fixtureName(url), fixtureDir);
    return Promise.resolve(existsSync(file) ? new Response(readFileSync(file, 'utf8')) : new Response('', { status: 404 }));
  };
  return { fetch, calls };
}
