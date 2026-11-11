// The browser side of the Catalog API (api.ts). Sends the ISBN and nothing
// else (ADR 0001). Rejects like fetch when the Atomes server cannot be reached.
import type { Edition, Lookup } from './catalog';

// The cover of an Edition, served by the Atomes server (api.ts): the browser
// never asks a book source, which would learn who looks at which book.
export function coverUrl(edition: Pick<Edition, 'isbn' | 'cover'>): string | null {
  return edition.cover ? `/api/catalog/editions/${edition.isbn}/cover` : null;
}

// An answer the service worker kept from before omnibus Volumes (CORE-41) has
// no `volumes`: its one Volume is all it has.
type Answered = Omit<Edition, 'volumes'> & { volumes?: number[] };
const withVolumes = (edition: Answered): Edition => ({ ...edition, volumes: edition.volumes ?? (edition.volume === null ? [] : [edition.volume]) });

export async function lookupEdition(isbn: string): Promise<Lookup> {
  const response = await fetch(`/api/catalog/editions/${encodeURIComponent(isbn)}`);
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
// Edition first looked up), by Volume number. Undefined when the Catalog does
// not know the ISBN or cannot answer.
export async function lookupVolumes(isbn: string): Promise<{ series: Edition['series']; volumes: Edition[] } | undefined> {
  const response = await fetch(`/api/catalog/editions/${encodeURIComponent(isbn)}/volumes`);
  if (!response.ok) return undefined;
  const answer = (await response.json()) as { series: Edition['series']; volumes: Answered[] };
  return { series: answer.series, volumes: answer.volumes.map(withVolumes) };
}
