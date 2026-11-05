// The Library model: the reader's records and Catalog data in, what a screen
// shows out. Pure: no Space, no network, so every rule here is tested alone.
import type { Edition } from '../catalog/catalog';
import { coverUrl } from '../catalog/client';
import type { Copy } from './copy';
import { statuses, type ReadingStatus, type Status } from './reading-status';
import type { Saved } from './records';

export interface Library {
  copies: Saved<Copy>[];
  readingStatuses: Saved<ReadingStatus>[];
}

// Catalog answers by ISBN. An ISBN missing here is unknown to the Catalog, or
// could not be asked (offline).
export type Editions = ReadonlyMap<string, Edition>;

export interface BookPage {
  work: string;
  // The Edition a new Reading Status points at: the one read, else the first Copy's.
  isbn: string;
  title: string;
  volumeTitle: string | null;
  authors: string[];
  series: string | null;
  volume: string | null;
  // A path on the Atomes server.
  cover: string | null;
  status: Status;
  finishedAt: string | undefined;
  copies: BookCopy[];
}

export interface BookCopy {
  rkey: string;
  isbn: string;
  // Publisher, language and format, as far as the Catalog knows them.
  edition: string;
  lentTo: string | undefined;
}

// Undefined when the Work is not in the Library: no Copy and no Reading Status.
export function bookPage(work: string, library: Library, editions: Editions): BookPage | undefined {
  const copies = library.copies
    .filter(({ value }) => value.works.includes(work))
    .sort((a, b) => a.value.createdAt.localeCompare(b.value.createdAt) || a.rkey.localeCompare(b.rkey));
  const readingStatus = currentReadingStatus(work, library);
  const isbn = readingStatus?.isbn ?? copies[0]?.value.isbn;
  if (isbn === undefined) return undefined;

  // The Catalog's Edition of this Work, else any Edition it knows of these
  // ISBNs (an omnibus, or a Work the Catalog identified later), else what the
  // reader typed on a Copy.
  const known = [isbn, ...copies.map(({ value }) => value.isbn)].flatMap((each) => editions.get(each) ?? []);
  const edition = known.find((each) => each.work.id === work) ?? known[0];
  const details = copies.find(({ value }) => value.details)?.value.details;

  return {
    work,
    isbn,
    title: edition?.title ?? details?.title ?? `ISBN ${isbn}`,
    volumeTitle: edition?.volumeTitle ?? null,
    authors: edition?.authors ?? details?.authors ?? [],
    series: edition?.series?.title ?? details?.series ?? null,
    volume: edition && edition.volume !== null ? String(edition.volume) : (details?.volume ?? null),
    cover: edition ? coverUrl(edition) : null,
    status: readingStatus?.status ?? 'unread',
    finishedAt: readingStatus?.finishedAt,
    copies: copies.map(({ rkey, value }) => ({
      rkey,
      isbn: value.isbn,
      edition: editionLabel(editions.get(value.isbn)),
      lentTo: value.lentTo,
    })),
  };
}

// The Reading Status to save when the reader picks `chosen` for a Work, or
// undefined when it is the current one: saving it again would drop its finish
// date, and "unread" with no record is already true (ADR 0010). A new status
// starts with no finish date.
export function statusChange(work: string, isbn: string, chosen: Status, library: Library, now: Date): ReadingStatus | undefined {
  const current = currentReadingStatus(work, library);
  if ((current?.status ?? 'unread') === chosen) return undefined;
  return { work, isbn: current?.isbn ?? isbn, status: chosen, updatedAt: now.toISOString() };
}

export function currentStatus(work: string, library: Library): Status {
  return currentReadingStatus(work, library)?.status ?? 'unread';
}

// A status this app does not know (written by a newer client) counts as no record (ADR 0010).
function currentReadingStatus(work: string, library: Library): ReadingStatus | undefined {
  const value = library.readingStatuses.find(({ rkey }) => rkey === work)?.value;
  return value && statuses.includes(value.status) ? value : undefined;
}

// UNIMARC 101 $a and Open Library give ISO 639-2/B codes.
const languages: Record<string, string> = {
  fre: 'French',
  eng: 'English',
  jpn: 'Japanese',
  ger: 'German',
  spa: 'Spanish',
  ita: 'Italian',
  kor: 'Korean',
};

export function editionLabel(edition: Edition | undefined): string {
  if (!edition) return '';
  const language = edition.language && (languages[edition.language] ?? edition.language);
  return [edition.publisher, language, edition.format].filter(Boolean).join(' · ');
}
