import { expect, test } from 'vitest';
import { recordedFetch } from './recorded.fake';

// The dev server can answer from the recorded sources (CATALOG_SOURCES=recorded),
// so the fake gets URLs that hold source data, not only the URLs of the tests.

test.each([
  // `openlibrary-x/../../../../../package.json`: the package.json of the project.
  ['package.json', 'https://openlibrary.org/search.json?isbn=x/../../../../../package'],
  ['recorded.fake.ts', `https://inventaire.io/api/entities?action=by-uris&uris=${encodeURIComponent('x/../../recorded.fake.ts#')}`],
  ['tsconfig.json', `https://catalogue.bnf.fr/api/SRU?query=bib.title&startRecord=${encodeURIComponent('x/../../../../../tsconfig.json#')}`],
])('a URL never reads a file outside the fixtures folder: %s', async (_, url) => {
  expect((await recordedFetch().fetch(url)).status).toBe(404);
});

test('a cover host has no recorded answer: 404, the way a source says "unknown"', async () => {
  expect((await recordedFetch().fetch('https://covers.openlibrary.org/b/id/12345-M.jpg')).status).toBe(404);
});
