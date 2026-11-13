// The open sources the Catalog asks on a miss, in the order of spike 0002
// (section 1): BnF SRU, then SUDOC when BnF has no Series or Volume, Inventaire
// for shared Work and Series identifiers and the cover, Open Library for a
// cover, Series or Volume still missing. Only ISBNs leave the server, and the
// cover URLs these sources gave.
import { isIsbn13, isSeriesId } from '../library/ids';
import type { Facts } from './facts';
import { volumeNumbers } from './facts';
import { isbns, publishedYear, recordFor, unimarcFacts, unimarcRecords } from './unimarc';

export type SourceFetch = (url: string) => Promise<Response>;

export const sourceUrls = {
  bnf: (isbn: string) =>
    `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=${encodeURIComponent(`bib.isbn adj "${isbn}"`)}&recordSchema=unimarcxchange&maximumRecords=10`,
  // The Editions BnF lists under a title and a publisher, 50 at a time.
  bnfSearch: (title: string, publisher: Publisher, start: number) =>
    `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=${encodeURIComponent(bnfTitleQuery(title, publisher))}&recordSchema=unimarcxchange&maximumRecords=50&startRecord=${start}`,
  sudocPpns: (isbn: string) => `https://www.sudoc.fr/services/isbn2ppn/${isbn}&format=text/json`,
  sudocRecord: (ppn: string) => `https://www.sudoc.fr/${ppn}.xml`,
  inventaire: (uri: string) => `https://inventaire.io/api/entities?action=by-uris&uris=${encodeURIComponent(uri)}`,
  openLibrary: (isbn: string) =>
    `https://openlibrary.org/search.json?isbn=${isbn}&fields=key,title,cover_i,series_key,series_name,series_position`,
};

// 404 means "not known here"; any other failure is an error, so the Catalog
// does not store an incomplete answer.
async function read(fetch: SourceFetch, url: string): Promise<Response | undefined> {
  const response = await fetch(url);
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`${new URL(url).host} answered HTTP ${response.status}`);
  return response;
}

export async function bnf(fetch: SourceFetch, isbn: string): Promise<Facts | undefined> {
  const response = await read(fetch, sourceUrls.bnf(isbn));
  const record = response && recordFor(unimarcRecords(await response.text()), isbn);
  return record && unimarcFacts(record, 'BnF');
}

export async function sudoc(fetch: SourceFetch, isbn: string): Promise<Facts | undefined> {
  const response = await read(fetch, sourceUrls.sudocPpns(isbn));
  if (!response) return undefined;
  const ppns = [...(await response.text()).matchAll(/"ppn"\s*:\s*"(\w+)"/g)].map(([, ppn]) => ppn);
  for (const ppn of ppns.slice(0, 3)) {
    const record = await read(fetch, sourceUrls.sudocRecord(ppn));
    const match = record && recordFor(unimarcRecords(await record.text()), isbn);
    if (match) return unimarcFacts(match, 'SUDOC');
  }
  return undefined;
}

export interface Listed {
  isbn: string;
  facts: Facts;
  year: number | undefined;
}

// A publisher name, or a list of words: an Edition under any of them.
export type Publisher = string | string[] | undefined;

// A title, or a publisher, with a double quote would end the CQL string early.
function bnfTitleQuery(title: string, publisher: Publisher): string {
  const clean = (text: string) => text.replace(/["\\]/g, ' ').trim();
  const byTitle = `bib.title all "${clean(title)}"`;
  if (Array.isArray(publisher)) return `${byTitle} and bib.publisher any "${clean(publisher.join(' '))}"`;
  return publisher ? `${byTitle} and bib.publisher all "${clean(publisher)}"` : byTitle;
}

// Every Edition BnF lists under this title (and publisher), at most `max`
// (spike 0002: BnF is the best source of Series and Volumes), and the title
// (200 `$a`) of every record, with an ISBN or not: BnF's Series records name
// the spelling BnF files the Volumes under (CORE-70). Only the title and the
// publisher leave the server, never an ISBN a reader asked about.
export async function bnfSearch(
  fetch: SourceFetch,
  title: string,
  publisher: Publisher,
  max = 500,
): Promise<{ listed: Listed[]; titles: string[] }> {
  const listed: Listed[] = [];
  const titles: string[] = [];
  for (let start = 1; start <= max - 49; start += 50) {
    const response = await read(fetch, sourceUrls.bnfSearch(title, publisher, start));
    if (!response) break;
    const xml = await response.text();
    for (const record of unimarcRecords(xml)) {
      const facts = unimarcFacts(record, 'BnF');
      if (facts.title) titles.push(facts.title);
      const isbn = isbns(record).find(isIsbn13);
      if (isbn) listed.push({ isbn, facts, year: publishedYear(record) });
    }
    if (start + 50 > Number(/numberOfRecords>(\d+)/.exec(xml)?.[1] ?? 0)) break;
  }
  return { listed, titles };
}

type Entity = { uri?: string; labels?: Record<string, string>; claims?: Record<string, unknown[]>; image?: { url?: string } };

async function entity(fetch: SourceFetch, uri: string): Promise<Entity | undefined> {
  const response = await read(fetch, sourceUrls.inventaire(uri));
  if (!response) return undefined;
  const body = (await response.json()) as { entities?: Record<string, Entity>; redirects?: Record<string, string> };
  return body.entities?.[uri] ?? body.entities?.[body.redirects?.[uri] ?? ''];
}

const claim = (e: Entity | undefined, property: string) => {
  const value = e?.claims?.[property]?.[0];
  return typeof value === 'string' ? value : undefined;
};

const label = (e: Entity | undefined) => e?.labels && (e.labels.fr ?? e.labels.en ?? Object.values(e.labels)[0]);

export async function inventaire(fetch: SourceFetch, isbn: string): Promise<Facts | undefined> {
  const edition = await entity(fetch, `isbn:${isbn}`);
  if (!edition) return undefined;
  const workId = claim(edition, 'wdt:P629');
  const work = workId && isSeriesId(workId) ? await entity(fetch, workId) : undefined;
  const seriesId = claim(work, 'wdt:P179');
  const series = seriesId && isSeriesId(seriesId) ? await entity(fetch, seriesId) : undefined;
  const image = edition.image?.url ?? (claim(edition, 'invp:P2') && `/img/entities/${claim(edition, 'invp:P2')}`);
  return {
    source: 'Inventaire',
    title: claim(edition, 'wdt:P1476'),
    cover: image ? new URL(image, 'https://inventaire.io').href : undefined,
    work: work && workId ? { id: workId, title: label(work) } : undefined,
    series: series && seriesId ? { id: seriesId, title: label(series) } : undefined,
    volumes: volumeNumbers(claim(work, 'wdt:P1545')),
  };
}

// What Inventaire says about many ISBNs, 50 per request: the Work and the
// cover, as `inventaire()` gives them, without the Work and Series details.
export async function inventaireEditions(fetch: SourceFetch, wanted: string[]): Promise<Map<string, Facts>> {
  const found = new Map<string, Facts>();
  for (let i = 0; i < wanted.length; i += 50) {
    const uris = wanted.slice(i, i + 50).map((isbn) => `isbn:${isbn}`);
    const response = await read(fetch, sourceUrls.inventaire(uris.join('|')));
    if (!response) continue;
    const body = (await response.json()) as { entities?: Record<string, Entity>; redirects?: Record<string, string> };
    for (const uri of uris) {
      const edition = body.entities?.[uri] ?? body.entities?.[body.redirects?.[uri] ?? ''];
      if (!edition) continue;
      const workId = claim(edition, 'wdt:P629');
      const image = edition.image?.url ?? (claim(edition, 'invp:P2') && `/img/entities/${claim(edition, 'invp:P2')}`);
      found.set(uri.slice('isbn:'.length), {
        source: 'Inventaire',
        title: claim(edition, 'wdt:P1476'),
        cover: image ? new URL(image, 'https://inventaire.io').href : undefined,
        work: workId && isSeriesId(workId) ? { id: workId } : undefined,
      });
    }
  }
  return found;
}

type OpenLibraryDoc = { title?: string; cover_i?: number; series_key?: string[]; series_name?: string[]; series_position?: string[] };

export async function openLibrary(fetch: SourceFetch, isbn: string): Promise<Facts | undefined> {
  const response = await read(fetch, sourceUrls.openLibrary(isbn));
  const doc = response && ((await response.json()) as { docs?: OpenLibraryDoc[] }).docs?.[0];
  if (!doc) return undefined;
  const seriesId = doc.series_key?.[0] && `ol:${doc.series_key[0]}`;
  return {
    source: 'Open Library',
    title: doc.title,
    cover: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : undefined,
    series: seriesId && isSeriesId(seriesId) ? { id: seriesId, title: doc.series_name?.[0] } : undefined,
    volumes: volumeNumbers(doc.series_position?.[0]),
  };
}

// Facts of every source that knows the ISBN, best source first. `failed` is
// true when a source could not be asked, so the answer may be incomplete.
export async function fetchFacts(fetch: SourceFetch, isbn: string): Promise<{ facts: Facts[]; failed: boolean }> {
  let failed = false;
  const ask = (source: () => Promise<Facts | undefined>) =>
    source().catch((error: unknown) => {
      failed = true;
      // Never log the ISBN: with the request time it could tell who scanned what.
      console.warn('Catalog source failed:', error instanceof Error ? error.message : error);
      return undefined;
    });
  const [fromBnf, fromInventaire] = await Promise.all([ask(() => bnf(fetch, isbn)), ask(() => inventaire(fetch, isbn))]);
  const known = [fromBnf, fromInventaire].filter((f) => f !== undefined);
  // A BnF Series without a Series record (`bnfId`) is only guessed from the
  // title, and recent BnF records often have no main author: SUDOC may know more.
  const needSudoc = !fromBnf?.series?.bnfId || !fromBnf.volumes?.length || !fromBnf.authors?.length;
  const needOpenLibrary = !known.some((f) => f.cover) || !known.some((f) => f.series) || !known.some((f) => f.volumes?.length);
  const [fromSudoc, fromOpenLibrary] = await Promise.all([
    needSudoc ? ask(() => sudoc(fetch, isbn)) : undefined,
    needOpenLibrary ? ask(() => openLibrary(fetch, isbn)) : undefined,
  ]);
  return { facts: [fromBnf, fromSudoc, fromInventaire, fromOpenLibrary].filter((f) => f !== undefined), failed };
}

// One request per second per host: BnF, SUDOC and Inventaire publish no rate
// limit, Open Library allows 1/s without an email (spike 0002).
export function politeFetch(userAgent: string, gapMs = 1100): SourceFetch {
  const nextSlot = new Map<string, number>();
  return async (url) => {
    const host = new URL(url).host;
    const now = Date.now();
    const slot = Math.max(now, nextSlot.get(host) ?? 0);
    nextSlot.set(host, slot + gapMs);
    if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now));
    return fetch(url, { headers: { 'user-agent': userAgent }, signal: AbortSignal.timeout(10_000) });
  };
}

// The cover URLs the sources give (Inventaire images, Open Library covers). The
// server fetches covers for the browser, so it fetches nothing else: a cover URL
// is source data, and a source could name any address.
export function isCoverUrl(raw: string): boolean {
  if (!URL.canParse(raw)) return false;
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return false;
  return (
    (url.hostname === 'inventaire.io' && url.pathname.startsWith('/img/')) ||
    (url.hostname === 'covers.openlibrary.org' && url.pathname.startsWith('/b/'))
  );
}
