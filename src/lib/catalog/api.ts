// HTTP answers of the Catalog API. The device sends an ISBN and nothing else;
// these handlers read no cookie, header or address and log nothing.
//
// GET /api/catalog/editions/{isbn}          → 200 Edition, 400, 404, 503
// GET /api/catalog/editions/{isbn}/volumes  → 200 { series, volumes }: the
//   known Volumes of the Edition Line of that (anchor) ISBN, by Volume number.
import { isIsbn13 } from '../library/ids';
import type { Catalog, Edition } from './catalog';

const json = (status: number, body: unknown) => Response.json(body, { status });

async function withEdition(catalog: Catalog, raw: string | undefined, answer: (edition: Edition) => Response) {
  const isbn = (raw ?? '').replace(/[\s-]/g, '');
  if (!isIsbn13(isbn)) return json(400, { error: 'InvalidIsbn', message: 'Send an ISBN-13: 13 digits starting with 978 or 979.' });
  const result = await catalog.lookup(isbn);
  if ('found' in result) return answer(result.found);
  if ('notFound' in result) return json(404, { error: 'NotFound', isbn, message: 'No open source knows this ISBN.' });
  return json(503, { error: 'SourcesUnavailable', isbn, message: 'The book sources do not answer. Try again later.' });
}

export const answerEdition = (catalog: Catalog, isbn: string | undefined) =>
  withEdition(catalog, isbn, (edition) => json(200, edition));

export const answerVolumes = (catalog: Catalog, isbn: string | undefined) =>
  withEdition(catalog, isbn, (edition) => json(200, { series: edition.series, volumes: catalog.volumes(edition) }));
