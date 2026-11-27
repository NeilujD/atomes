// HTTP answers of the Catalog API. The device sends an ISBN and nothing else;
// these handlers read no cookie, header or address and log nothing. The routes
// first check access (access.ts): a signed-out client over its limit gets 429.
//
// GET /api/catalog/editions/{isbn}          → 200 Edition, 400, 404, 429, 503
// GET /api/catalog/editions/{isbn}/volumes  → 200 { series, volumes, lines,
//   fillFailed }: the known Volumes of the Edition Line of that (anchor) ISBN,
//   by Volume number, and every Edition Line of its Series, named
//   (LineSummary). Only a signed-in reader starts a fill of the Edition Line;
//   `fillFailed` when a book source failed for it (more Volumes may exist).
// GET /api/catalog/editions/{isbn}/cover    → 200 picture, 400, 404, 429, 503
// GET /api/catalog/search?title=&publisher= → 200 SearchFound, 400, 401, 503:
//   a signed-in reader looks for an ISBN no source knows by its title (CORE-40).
// PUT /api/catalog/editions/{isbn} Choice   → 200 Edition, 400, 401, 409, 422,
//   503: a signed-in reader picks the Series (or Work) of an ISBN no source knows.
// PUT /api/catalog/editions/{isbn}/correction Correction → 200 Edition, 400,
//   401, 404, 422, 429, 503: a signed-in reader's Series Correction (ADR 0017).
// DELETE /api/catalog/editions/{isbn}/correction → 200 Edition, 400, 401, 404,
//   429: "Back to the sources".
// GET /api/catalog/series?title=            → 200 { series: SeriesFound[] },
//   400, 401: the Series of this Catalog by title, for a Series Correction.
// GET /api/catalog/find?words=               → 200 Found { works, authors, series },
//   400, 401, 503: Search (ADR 0021), a signed-in reader's title or author words.
// GET /api/catalog/find/editions?work=…      → 200 EditionsFound, 400, 401,
//   503: the Editions of a Search row, its Work and the identifiers of `also`;
//   a BnF row (`bnf:`) also sends the `words` of its search.
// GET /api/catalog/find/author?author=…&page= → 200 AuthorWorks, 400, 401,
//   503: one page of 20 Works of an Author of Search, newest first.
// GET /api/catalog/find/series?series=…      → 200 { volumes }, 400, 401, 503:
//   the Volumes of a Series row of Search, by number (CORE-187).
// A Correction is the only request that sends who asks (the session cookie):
// the routes check it and a write limit per Account (access.ts).
import type { Language } from '../i18n/i18n';
import { isIsbn13 } from '../library/ids';
import type { Catalog, Choice, Correction, Edition } from './catalog';
import { parsePreferredLanguage } from './languages';
import { isBnfWorkId, isInventaireId, isWorkResultId } from './search';

const json = (status: number, body: unknown) => Response.json(body, { status });

export const parseIsbn = (raw: string | undefined) => (raw ?? '').replace(/[\s-]/g, '');
const invalidIsbn = () => json(400, { error: 'InvalidIsbn', message: 'Send an ISBN-13: 13 digits starting with 978 or 979.' });
const sourcesDown = () => json(503, { error: 'SourcesUnavailable', message: 'The book sources do not answer. Try again later.' });
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
  withEdition(catalog, isbn, async (edition) => {
    const { volumes, fillFailed } = await catalog.volumes(edition, options);
    return json(200, { series: edition.series, volumes, lines: catalog.lines(edition), fillFailed });
  });

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
  return 'unavailable' in found ? sourcesDown() : json(200, found);
}

// Search (ADR 0021): only the words leave the server, for a signed-in reader.
export async function answerFind(catalog: Catalog, url: URL, { signedIn, language }: { signedIn: boolean; language: Language }) {
  if (!signedIn) return signedOut();
  const words = typedText(url.searchParams.get('words'));
  if (!words) return json(400, { error: 'InvalidSearch', message: 'Send title or author words, 300 characters at most.' });
  const found = await catalog.find(words, language);
  return 'unavailable' in found ? sourcesDown() : json(200, found);
}

// A Search row names its Work and at most a few other identifiers of it.
const maxWorkIds = 5;

export async function answerWorkEditions(catalog: Catalog, url: URL, { signedIn }: { signedIn: boolean }) {
  if (!signedIn) return signedOut();
  const ids = url.searchParams.getAll('work');
  if (ids.length === 0 || ids.length > maxWorkIds || !ids.every(isWorkResultId))
    return json(400, { error: 'InvalidWork', message: `Send 1 to ${maxWorkIds} Work identifiers (wd: or inv:).` });
  // The Preferred Language (none: all languages), and the language of the words (CORE-186).
  const language = url.searchParams.has('language') ? parsePreferredLanguage(url.searchParams.get('language')) : 'all';
  const matched = url.searchParams.get('matched') ?? undefined;
  if (!language || (matched !== undefined && !/^[a-z]{2,3}$/.test(matched)))
    return json(400, { error: 'InvalidLanguage', message: 'Send a Preferred Language (fr, en, …, all) and a matched language code.' });
  // A BnF row opens again from the words of its search.
  const words = ids.some(isBnfWorkId) ? typedText(url.searchParams.get('words')) : undefined;
  if (ids.some(isBnfWorkId) && (!words || ids.length > 1))
    return json(400, { error: 'InvalidWork', message: 'Send one BnF Work, with the words of its search.' });
  const found = await catalog.editions(ids, { language, matched }, words);
  return 'unavailable' in found ? sourcesDown() : json(200, found);
}

// The last page an Author list may ask for: 100 pages of 20 Works.
const maxAuthorPage = 100;

export async function answerAuthorWorks(catalog: Catalog, url: URL, { signedIn }: { signedIn: boolean }) {
  if (!signedIn) return signedOut();
  const author = url.searchParams.get('author') ?? '';
  const page = Number(url.searchParams.get('page') ?? '1');
  if (!isInventaireId(author) || !Number.isInteger(page) || page < 1 || page > maxAuthorPage)
    return json(400, { error: 'InvalidAuthor', message: `Send an Author identifier (wd: or inv:) and a page from 1 to ${maxAuthorPage}.` });
  const found = await catalog.authorWorks(author, page);
  return 'unavailable' in found ? sourcesDown() : json(200, found);
}

export async function answerSeriesVolumes(catalog: Catalog, url: URL, { signedIn, language }: { signedIn: boolean; language: Language }) {
  if (!signedIn) return signedOut();
  const series = url.searchParams.get('series') ?? '';
  if (!isInventaireId(series)) return json(400, { error: 'InvalidSeries', message: 'Send a Series identifier (wd: or inv:).' });
  const found = await catalog.seriesVolumes(series, language);
  return 'unavailable' in found ? sourcesDown() : json(200, found);
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

// A Series Correction from the body, or undefined when it is not one. The
// language is a code as the sources give it ("fre"); the book size in cm.
function readCorrection(body: unknown): Correction | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { anchor, newSeries, volume } = body as Record<string, unknown>;
  const okVolume = volume === null || (typeof volume === 'number' && volume > 0 && volume < 10_000);
  if (!okVolume) return undefined;
  if (typeof anchor === 'string' && newSeries === undefined) return isIsbn13(anchor) ? { anchor, volume } : undefined;
  if (anchor !== undefined || typeof newSeries !== 'object' || newSeries === null) return undefined;
  const { title, publisher, language, height } = newSeries as Record<string, unknown>;
  const text = (raw: unknown) => (typeof raw === 'string' ? typedText(raw) : undefined);
  const [okTitle, okPublisher] = [text(title), text(publisher)];
  const okLanguage = typeof language === 'string' && /^[a-z]{3}$/.test(language);
  const okHeight = height === null || (typeof height === 'number' && height >= 5 && height <= 100);
  if (!okTitle || !okPublisher || !okLanguage || !okHeight) return undefined;
  return { newSeries: { title: okTitle, publisher: okPublisher, language, height }, volume };
}

const invalidCorrection = () =>
  json(400, {
    error: 'InvalidCorrection',
    message: 'Send a Volume number or null, and an anchor ISBN-13 or a new Series (title, publisher, language, height).',
  });

// The Account is kept with the Correction, never in an answer (ADR 0017).
export async function answerCorrect(catalog: Catalog, raw: string | undefined, body: unknown, account: string) {
  const isbn = parseIsbn(raw);
  if (!isIsbn13(isbn)) return invalidIsbn();
  const correction = readCorrection(body);
  if (!correction) return invalidCorrection();
  const corrected = await catalog.correct(isbn, correction, account);
  if ('found' in corrected) return json(200, corrected.found);
  if ('notFound' in corrected) return json(404, { error: 'NotFound', isbn, message: 'No open source knows this ISBN.' });
  if ('badAnchor' in corrected)
    return json(422, { error: 'BadAnchor', reason: corrected.badAnchor, message: 'The chosen book is in no Edition Line of this Catalog.' });
  return unavailable(isbn);
}

export function answerUncorrect(catalog: Catalog, raw: string | undefined) {
  const isbn = parseIsbn(raw);
  if (!isIsbn13(isbn)) return invalidIsbn();
  const edition = catalog.uncorrect(isbn);
  return edition ? json(200, edition) : json(404, { error: 'NotFound', isbn, message: 'The Catalog has no Edition for this ISBN.' });
}

// The Series of this Catalog by title, with their Edition Lines: what a Series
// Correction picks from. Signed-in readers only, as the Correction itself.
export function answerFindSeries(catalog: Catalog, url: URL, { signedIn }: { signedIn: boolean }) {
  if (!signedIn) return signedOut();
  const title = typedText(url.searchParams.get('title'));
  if (!title) return json(400, { error: 'InvalidSearch', message: 'Send a title, 300 characters at most.' });
  return json(200, { series: catalog.findSeries(title) });
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
