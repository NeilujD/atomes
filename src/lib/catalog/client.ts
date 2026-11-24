// The browser side of the Catalog API (api.ts). Sends the ISBN and nothing
// else (ADR 0001), except for an ISBN no source knows: then the title and
// publisher the reader typed, and the book they picked (ADR 0010, CORE-40),
// for a Series Correction (ADR 0017), and the words of a Search (ADR 0021).
// Rejects like fetch when the Atomes server cannot be reached.
import type { Choice, Correction, Edition, LineSummary, Lookup, SearchFound, SeriesFound } from './catalog';
import type { AuthorResult, AuthorWorks, EditionsFound, Found, WorkResult } from './search';

// The cover of an Edition, served by the Atomes server (api.ts): the browser
// never asks a book source, which would learn who looks at which book.
export function coverUrl(edition: Pick<Edition, 'isbn' | 'cover'>): string | null {
  return edition.cover ? coverPath(edition.isbn) : null;
}

export const coverPath = (isbn: string) => `/api/catalog/editions/${isbn}/cover`;

// The paths of an ISBN lookup and of its Edition Line (api.ts). The service
// worker and the device Catalog (device.ts) keep the answers under them.
export const editionPath = (isbn: string) => `/api/catalog/editions/${encodeURIComponent(isbn)}`;
export const volumesPath = (isbn: string) => `${editionPath(isbn)}/volumes`;

// An answer the service worker kept from before omnibus Volumes (CORE-41) has
// no `volumes`: its one Volume is all it has.
export type Answered = Omit<Edition, 'volumes'> & { volumes?: number[] };
export const withVolumes = (edition: Answered): Edition => ({
  ...edition,
  volumes: edition.volumes ?? (edition.volume === null ? [] : [edition.volume]),
});

export async function lookupEdition(isbn: string): Promise<Lookup> {
  const response = await fetch(editionPath(isbn));
  if (response.ok) return { found: withVolumes((await response.json()) as Answered) };
  if (response.status === 404) return { notFound: true };
  return { unavailable: true };
}

// The Catalog's Editions of these ISBNs; an ISBN it could not answer is left out.
export async function lookupEditions(isbns: string[]): Promise<Map<string, Edition>> {
  const answers = await Promise.all(
    [...new Set(isbns)].map((isbn) => lookupEdition(isbn).catch(() => ({ unavailable: true }) as const)),
  );
  return new Map(answers.flatMap((answer) => ('found' in answer ? [[answer.found.isbn, answer.found] as const] : [])));
}

// The Volumes the Catalog knows in the Edition Line of `isbn` (its anchor
// Edition first looked up), by Volume number, and every Edition Line of its
// Series (none in an answer kept from before CORE-95). Undefined when the
// Catalog does not know the ISBN or cannot answer.
export async function lookupVolumes(
  isbn: string,
): Promise<{ series: Edition['series']; volumes: Edition[]; lines: LineSummary[] } | undefined> {
  const response = await fetch(volumesPath(isbn));
  if (!response.ok) return undefined;
  const answer = (await response.json()) as { series: Edition['series']; volumes: Answered[]; lines?: LineSummary[] };
  return { series: answer.series, volumes: answer.volumes.map(withVolumes), lines: answer.lines ?? [] };
}

export type SearchAnswer = { found: SearchFound } | { signedOut: true } | { unavailable: true };

// The Edition Lines and books BnF lists under a typed title (and publisher).
export async function searchCatalog(title: string, publisher: string): Promise<SearchAnswer> {
  const query = new URLSearchParams({ title, ...(publisher && { publisher }) });
  const response = await fetch(`/api/catalog/search?${query}`);
  if (response.ok) return { found: (await response.json()) as SearchFound };
  return response.status === 401 ? { signedOut: true } : { unavailable: true };
}

export type FoundAnswer<T> = { found: T } | { signedOut: true } | { unavailable: true };

async function foundAnswer<T>(response: Response): Promise<FoundAnswer<T>> {
  if (response.ok) return { found: (await response.json()) as T };
  return response.status === 401 ? { signedOut: true } : { unavailable: true };
}

// Search (ADR 0021): the Works and Authors the sources find under the typed words.
export async function findWorks(words: string): Promise<FoundAnswer<Found>> {
  return foundAnswer<Found>(await fetch(`/api/catalog/find?${new URLSearchParams({ words })}`));
}

// The Editions of a Search row: its Work, then its other identifiers; a BnF
// row also sends the words of its search.
export async function findEditions(work: Pick<WorkResult, 'id' | 'also' | 'words'>): Promise<FoundAnswer<EditionsFound>> {
  const query = new URLSearchParams([...[work.id, ...work.also].map((id) => ['work', id]), ...(work.words ? [['words', work.words]] : [])]);
  return foundAnswer<EditionsFound>(await fetch(`/api/catalog/find/editions?${query}`));
}

// One page (from 1) of 20 Works of an Author of Search, newest first.
export async function findAuthorWorks(author: Pick<AuthorResult, 'id'>, page: number): Promise<FoundAnswer<AuthorWorks>> {
  return foundAnswer<AuthorWorks>(await fetch(`/api/catalog/find/author?${new URLSearchParams({ author: author.id, page: String(page) })}`));
}

export type ChooseAnswer =
  | { found: Edition }
  // The picked book has no Work the sources share: the reader types the book.
  | { noSharedWork: true }
  | { signedOut: true }
  | { failed: true };

// Keeps the reader's pick in the Catalog for an ISBN no source knows.
export async function chooseEdition(isbn: string, choice: Choice): Promise<ChooseAnswer> {
  const response = await fetch(`/api/catalog/editions/${encodeURIComponent(isbn)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(choice),
  });
  if (response.ok) return { found: (await response.json()) as Edition };
  if (response.status === 401) return { signedOut: true };
  const body = (await response.json().catch(() => ({}))) as { reason?: string };
  return response.status === 422 && body.reason === 'no-shared-work' ? { noSharedWork: true } : { failed: true };
}

export type CorrectionAnswer = { found: Edition } | { signedOut: true } | { tooMany: true } | { failed: true };

const correctionPath = (isbn: string) => `${editionPath(isbn)}/correction`;

async function correctionAnswer(response: Response): Promise<CorrectionAnswer> {
  if (response.ok) return { found: withVolumes((await response.json()) as Answered) };
  if (response.status === 401) return { signedOut: true };
  return response.status === 429 ? { tooMany: true } : { failed: true };
}

// A reader's Series Correction of the Edition (ADR 0017): every reader of the instance gets it.
export async function correctEdition(isbn: string, correction: Correction): Promise<CorrectionAnswer> {
  const response = await fetch(correctionPath(isbn), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(correction),
  });
  return correctionAnswer(response);
}

// "Back to the sources": the Edition as the sources give it.
export async function uncorrectEdition(isbn: string): Promise<CorrectionAnswer> {
  return correctionAnswer(await fetch(correctionPath(isbn), { method: 'DELETE' }));
}

export type SeriesAnswer = { found: SeriesFound[] } | { signedOut: true } | { failed: true };

// The Series of this Catalog by title, with their Edition Lines.
export async function findSeries(title: string): Promise<SeriesAnswer> {
  const response = await fetch(`/api/catalog/series?${new URLSearchParams({ title })}`);
  if (response.ok) return { found: ((await response.json()) as { series: SeriesFound[] }).series };
  return response.status === 401 ? { signedOut: true } : { failed: true };
}

// After a Series Correction, this device asks again for the Edition and its
// Edition Line: the service worker keeps the new answers (network first),
// for Shelf Check offline too (device.ts). The line it left is asked again
// when a page shows it.
export async function refreshCorrected(isbn: string): Promise<void> {
  await Promise.all([fetch(editionPath(isbn)), fetch(volumesPath(isbn))]).catch(() => undefined);
}
