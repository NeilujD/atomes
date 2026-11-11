// HTTP answers of the Catalog API. The device sends an ISBN and nothing else;
// these handlers read no cookie, header or address and log nothing. The routes
// first check access (access.ts): a signed-out client over its limit gets 429.
//
// GET /api/catalog/editions/{isbn}          → 200 Edition, 400, 404, 429, 503
// GET /api/catalog/editions/{isbn}/volumes  → 200 { series, volumes }: the
//   known Volumes of the Edition Line of that (anchor) ISBN, by Volume number.
//   Only a signed-in reader starts a fill of the Edition Line.
// GET /api/catalog/editions/{isbn}/cover    → 200 picture, 400, 404, 429, 503
// GET /api/catalog/search?title=&publisher= → 200 SearchFound, 400, 401, 503:
//   a signed-in reader looks for an ISBN no source knows by its title (CORE-40).
// PUT /api/catalog/editions/{isbn} Choice   → 200 Edition, 400, 401, 409, 422,
//   503: a signed-in reader picks the Series (or Work) of an ISBN no source knows.
import { isIsbn13 } from '../library/ids';
import type { Catalog, Choice, Edition } from './catalog';

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

const signedOut = () => json(401, { error: 'SignedOut', message: 'Sign in to search the book sources.' });
// The Copy lexicon allows 300 characters in a typed title (bookDetails).
const typedText = (raw: string | null | undefined) => {
  const text = (raw ?? '').trim();
  return text.length > 300 ? undefined : text;
};

export async function answerSearch(catalog: Catalog, url: URL, { signedIn }: { signedIn: boolean }) {
  if (!signedIn) return signedOut();
  const title = typedText(url.searchParams.get('title'));
  const publisher = typedText(url.searchParams.get('publisher'));
  if (!title || publisher === undefined) return json(400, { error: 'InvalidSearch', message: 'Send a title (and a publisher), 300 characters at most.' });
  const found = await catalog.search(title, publisher || undefined);
  return 'unavailable' in found
    ? json(503, { error: 'SourcesUnavailable', message: 'The book sources do not answer. Try again later.' })
    : json(200, found);
}

// A Choice from the body, or undefined when it is not one.
function readChoice(body: unknown): Choice | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { anchor, volume, title, authors } = body as Record<string, unknown>;
  const text = typeof title === 'string' ? typedText(title) : undefined;
  const names = authors === undefined ? [] : Array.isArray(authors) ? authors : undefined;
  const okVolume = volume === undefined || volume === null || (typeof volume === 'number' && volume > 0 && volume < 10_000);
  const okNames = names?.length !== undefined && names.length <= 20 && names.every((name) => typeof name === 'string' && name.trim() && name.length <= 300);
  if (typeof anchor !== 'string' || !isIsbn13(anchor) || !text || !okVolume || !okNames) return undefined;
  return { anchor, volume: typeof volume === 'number' ? volume : null, title: text, authors: (names as string[]).map((name) => name.trim()) };
}

export async function answerChoose(catalog: Catalog, raw: string | undefined, body: unknown, { signedIn }: { signedIn: boolean }) {
  if (!signedIn) return signedOut();
  const isbn = parseIsbn(raw);
  if (!isIsbn13(isbn)) return invalidIsbn();
  const choice = readChoice(body);
  if (!choice) return json(400, { error: 'InvalidChoice', message: 'Send an anchor ISBN-13, a title, and a Volume number or none.' });
  const chosen = await catalog.choose(isbn, choice);
  if ('found' in chosen) return json(200, chosen.found);
  if ('known' in chosen) return json(409, { error: 'KnownIsbn', isbn, message: 'A book source knows this ISBN.' });
  if ('badAnchor' in chosen) return json(422, { error: 'BadAnchor', reason: chosen.badAnchor, message: 'The chosen book cannot give this ISBN a Series or a Work.' });
  return unavailable(isbn);
}
