// The browser side of the Catalog API (api.ts). Sends the ISBN and nothing
// else (ADR 0001), except for an ISBN no source knows: then the title and
// publisher the reader typed, and the book they picked (ADR 0010, CORE-40).
// Rejects like fetch when the Atomes server cannot be reached.
import type { Choice, Edition, Lookup, SearchFound } from './catalog';

// The cover of an Edition, served by the Atomes server (api.ts): the browser
// never asks a book source, which would learn who looks at which book.
export function coverUrl(edition: Pick<Edition, 'isbn' | 'cover'>): string | null {
  return edition.cover ? `/api/catalog/editions/${edition.isbn}/cover` : null;
}

export async function lookupEdition(isbn: string): Promise<Lookup> {
  const response = await fetch(`/api/catalog/editions/${encodeURIComponent(isbn)}`);
  if (response.ok) return { found: (await response.json()) as Edition };
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
// Edition first looked up), by Volume number. Undefined when the Catalog does
// not know the ISBN or cannot answer.
export async function lookupVolumes(isbn: string): Promise<{ series: Edition['series']; volumes: Edition[] } | undefined> {
  const response = await fetch(`/api/catalog/editions/${encodeURIComponent(isbn)}/volumes`);
  return response.ok ? ((await response.json()) as { series: Edition['series']; volumes: Edition[] }) : undefined;
}

export type SearchAnswer = { found: SearchFound } | { signedOut: true } | { unavailable: true };

// The Edition Lines and books BnF lists under a typed title (and publisher).
export async function searchCatalog(title: string, publisher: string): Promise<SearchAnswer> {
  const query = new URLSearchParams({ title, ...(publisher && { publisher }) });
  const response = await fetch(`/api/catalog/search?${query}`);
  if (response.ok) return { found: (await response.json()) as SearchFound };
  return response.status === 401 ? { signedOut: true } : { unavailable: true };
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
