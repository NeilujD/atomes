// HTTP answers of the Catalog API. The device sends an ISBN and nothing else;
// these handlers read no cookie, header or address and log nothing. The routes
// first check access (access.ts): a signed-out client over its limit gets 429.
//
// GET /api/catalog/editions/{isbn}          → 200 Edition, 400, 404, 429, 503
// GET /api/catalog/editions/{isbn}/volumes  → 200 { series, volumes }: the
//   known Volumes of the Edition Line of that (anchor) ISBN, by Volume number.
//   Only a signed-in reader starts a fill of the Edition Line.
// GET /api/catalog/editions/{isbn}/cover    → 200 picture, 400, 404, 429, 503
import { isIsbn13 } from '../library/ids';
import type { Catalog, Edition } from './catalog';

const json = (status: number, body: unknown) => Response.json(body, { status });

const parseIsbn = (raw: string | undefined) => (raw ?? '').replace(/[\s-]/g, '');
const invalidIsbn = () => json(400, { error: 'InvalidIsbn', message: 'Send an ISBN-13: 13 digits starting with 978 or 979.' });
const unavailable = (isbn: string) =>
  json(503, { error: 'SourcesUnavailable', isbn, message: 'The book sources do not answer. Try again later.' });

async function withEdition(catalog: Catalog, raw: string | undefined, answer: (edition: Edition) => Response | Promise<Response>) {
  const isbn = parseIsbn(raw);
  if (!isIsbn13(isbn)) return invalidIsbn();
  const result = await catalog.lookup(isbn);
  if ('found' in result) return answer(result.found);
  if ('notFound' in result) return json(404, { error: 'NotFound', isbn, message: 'No open source knows this ISBN.' });
  return unavailable(isbn);
}

export const answerEdition = (catalog: Catalog, isbn: string | undefined) =>
  withEdition(catalog, isbn, (edition) => json(200, edition));

export const answerVolumes = (catalog: Catalog, isbn: string | undefined, options: { fill: boolean }) =>
  withEdition(catalog, isbn, async (edition) => json(200, { series: edition.series, volumes: await catalog.volumes(edition, options) }));

export async function answerCover(catalog: Catalog, raw: string | undefined) {
  const isbn = parseIsbn(raw);
  if (!isIsbn13(isbn)) return invalidIsbn();
  const result = await catalog.cover(isbn);
  if ('found' in result) {
    return new Response(result.found.bytes, {
      headers: {
        'content-type': result.found.type,
        'x-content-type-options': 'nosniff',
        // The service worker keeps covers, and sign-out clears them; the HTTP
        // cache would keep them after sign-out.
        'cache-control': 'no-store',
      },
    });
  }
  if ('notFound' in result) return json(404, { error: 'NoCover', isbn, message: 'No cover is known for this ISBN.' });
  return unavailable(isbn);
}
