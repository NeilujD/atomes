// The Library model: the reader's records and Catalog data in, what a screen
// shows out. Pure: no Space, no network, so every rule here is tested alone.
import type { Edition } from '../catalog/catalog';
import type { LineName } from '../catalog/lines';
import { coverUrl } from '../catalog/client';
import { pageLanguage, translator, type Language } from '../i18n/i18n';
import type { Copy } from './copy';
import { dayOf } from './day';
import type { Follow } from './follow';
import type { Loan } from './loan';
import { statuses, type ReadingStatus, type Status } from './reading-status';
import type { Saved } from './records';
import type { ToBuy } from './to-buy';

export interface Library {
  copies: Saved<Copy>[];
  readingStatuses: Saved<ReadingStatus>[];
  follows: Saved<Follow>[];
  loans: Saved<Loan>[];
  // The Editions added to To Buy by hand; the rest of To Buy is computed (to-buy.ts).
  toBuy: Saved<ToBuy>[];
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
  // The Catalog's Volumes of the Edition, several for an omnibus; none when it does not know them.
  volumes: number[];
  // A path on the Atomes server.
  cover: string | null;
  status: Status;
  // Calendar days (day.ts); undefined on a record saved with none.
  startedAt: string | undefined;
  finishedAt: string | undefined;
  copies: BookCopy[];
}

export interface BookCopy {
  rkey: string;
  isbn: string;
  // Publisher, language and format, as far as the Catalog knows them.
  edition: string;
  // The day the reader got it, if they said (ADR 0019).
  acquiredAt: string | undefined;
  // Who has this Copy now; undefined when the reader has it.
  loan: { rkey: string; borrower: string; lentAt: string } | undefined;
  // Returned Loans, latest first.
  pastLoans: { borrower: string; lentAt: string; returnedAt: string }[];
}

export function bookHref(work: string): string {
  return `/book?work=${encodeURIComponent(work)}`;
}

// The ISBNs the Book page asks the Catalog for: those of the Work's Copies and
// Reading Status. An `isbn:` Work too: the Catalog gives it to a Volume it
// knows only from BnF, and it remembers the ISBNs it does not know.
export function bookIsbns(work: string, library: Library): string[] {
  const isbns = [
    ...library.copies.filter(({ value }) => value.works.includes(work)).map(({ value }) => value.isbn),
    ...library.readingStatuses.filter(({ rkey }) => rkey === work).map(({ value }) => value.isbn),
  ];
  return [...new Set(isbns)];
}

// Undefined when the Work is not in the Library: no Copy and no Reading Status.
export function bookPage(work: string, library: Library, editions: Editions, language: Language = pageLanguage()): BookPage | undefined {
  const copies = copiesOf(work, library);
  const readingStatus = currentReadingStatus(work, library);
  const isbn = readingStatus?.isbn ?? copies[0]?.value.isbn;
  if (isbn === undefined) return undefined;

  // The Catalog's Edition (workEdition), else what the reader typed on a
  // Copy. A typed title wins: it is the reader's own.
  const edition = workEdition(work, library, editions);
  const details = copies.find(({ value }) => value.details)?.value.details;

  return {
    work,
    isbn,
    title: details?.title ?? edition?.title ?? translator(language)('book.isbn', isbn),
    volumeTitle: edition?.volumeTitle ?? null,
    authors: edition?.authors ?? details?.authors ?? [],
    series: edition?.series?.title ?? details?.series ?? null,
    volume: edition && edition.volume !== null ? String(edition.volume) : (details?.volume ?? null),
    volumes: edition?.volumes ?? [],
    cover: edition ? coverUrl(edition) : null,
    status: readingStatus?.status ?? 'unread',
    startedAt: readingStatus?.startedAt,
    finishedAt: readingStatus?.finishedAt,
    copies: copies.map(({ rkey, value }) => {
      const loans = loansOf(rkey, library);
      const open = loans.find(({ value: loan }) => loan.returnedAt === undefined);
      return {
        rkey,
        isbn: value.isbn,
        edition: editionLabel(editions.get(value.isbn), language),
        acquiredAt: value.acquiredAt,
        loan: open && { rkey: open.rkey, borrower: open.value.borrower, lentAt: open.value.lentAt },
        pastLoans: loans.flatMap(({ value: { borrower, lentAt, returnedAt } }) => (returnedAt ? [{ borrower, lentAt, returnedAt }] : [])),
      };
    }),
  };
}

// The Copies of a Work, the first one added first.
function copiesOf(work: string, library: Library): Saved<Copy>[] {
  return library.copies
    .filter(({ value }) => value.works.includes(work))
    .sort((a, b) => a.value.createdAt.localeCompare(b.value.createdAt) || a.rkey.localeCompare(b.rkey));
}

// The Catalog's Edition of a Work of the Library, for every screen that shows
// the book: the Edition of this Work, else any Edition the Catalog knows of
// its ISBNs (an omnibus, or a Work the Catalog identified later), the one
// read first, then the Copies from the first added.
export function workEdition(work: string, library: Library, editions: Editions): Edition | undefined {
  const isbns = [currentReadingStatus(work, library)?.isbn ?? [], copiesOf(work, library).map(({ value }) => value.isbn)].flat();
  const known = isbns.flatMap((isbn) => editions.get(isbn) ?? []);
  return known.find((each) => each.work.id === work) ?? known[0];
}

// The Loans of one Copy, latest first: its history, and at most one open
// Loan to show (two devices may each have opened one).
export function loansOf(copy: string, library: Library): Saved<Loan>[] {
  return library.loans
    .filter(({ value }) => value.copy === copy)
    .sort((a, b) => b.value.lentAt.localeCompare(a.value.lentAt) || b.rkey.localeCompare(a.rkey));
}

// The Loan to save when the reader lends a Copy: open, from now.
export function lend(copy: string, borrower: string, now: Date): Loan {
  return { copy, borrower: borrower.trim(), lentAt: now.toISOString(), createdAt: now.toISOString() };
}

// The Loans to save when a Copy comes back: each open one gets its return date.
export function returnLoans(copy: string, library: Library, now: Date): Saved<Loan>[] {
  return library.loans
    .filter(({ value }) => value.copy === copy && value.returnedAt === undefined)
    .map(({ rkey, value }) => ({ rkey, value: { ...value, returnedAt: now.toISOString() } }));
}

// The one rule for "the reader owns this Work" (ADR 0010, amendment
// 2026-11-09), used by Owned-Unread, Missing Volumes, To Buy and Series
// counts: a Copy contains the Work, or is this Edition (saved as `isbn:`
// before the Catalog knew its Work). A lent Copy is still owned. When a Copy
// gets an end date, a Copy with one stops counting here.
export function isOwned(edition: Pick<Edition, 'isbn' | 'work'>, library: Library): boolean {
  return library.copies.some(({ value }) => value.isbn === edition.isbn || value.works.includes(edition.work.id));
}

// When the reader added their first Copy of an Edition or of its Work (the
// isOwned rule): the date Shelf Check shows. Undefined when they own none.
export function addedOn(edition: Pick<Edition, 'isbn' | 'work'>, library: Library): string | undefined {
  return library.copies
    .filter(({ value }) => value.isbn === edition.isbn || value.works.includes(edition.work.id))
    .map(({ value }) => value.createdAt)
    .sort()[0];
}

// "Owned" for a Work of the Library, by the rule above: a Copy lists the
// Work, or is the Edition of its Reading Status (saved as `isbn:`).
export function ownsWork(work: string, library: Library): boolean {
  return bookIsbns(work, library).some((isbn) => isOwned({ isbn, work: { id: work, title: '' } }, library));
}

// The Reading Status to save when the reader picks `chosen` for a Work, or
// undefined when it is the current one: saving it again would change nothing,
// and "unread" with no record is already true (ADR 0010).
// A dated change (one Work, today: Book page, Volume sheet, Shelf Check) sets
// the days of ADR 0019. A change that is not dated (a bulk mark, Series
// Onboarding) says "read before": it sets no day and keeps the days there are.
export function statusChange(
  work: string,
  isbn: string,
  chosen: Status,
  library: Library,
  now: Date,
  { dated }: { dated: boolean },
): ReadingStatus | undefined {
  const current = currentReadingStatus(work, library);
  if ((current?.status ?? 'unread') === chosen) return undefined;
  const { startedAt, finishedAt } = dated ? datedDays(chosen, current?.startedAt, dayOf(now)) : { ...current };
  return {
    work,
    isbn: current?.isbn ?? isbn,
    status: chosen,
    ...(startedAt && { startedAt }),
    ...(finishedAt && { finishedAt }),
    updatedAt: now.toISOString(),
  };
}

function datedDays(chosen: Status, startedAt: string | undefined, today: string): Pick<ReadingStatus, 'startedAt' | 'finishedAt'> {
  switch (chosen) {
    case 'reading':
      return { startedAt: startedAt ?? today };
    case 'read':
      return { startedAt, finishedAt: today };
    case 'abandoned':
      return { startedAt };
    case 'unread':
      return {};
  }
}

// The Reading Status with one day corrected by the reader on the Book page.
// `typed` is the value of a date field, `YYYY-MM-DD`; empty removes the day.
// A finish day before the start day is refused.
export function dayCorrection(
  current: ReadingStatus,
  field: 'startedAt' | 'finishedAt',
  typed: string,
  now: Date,
): ReadingStatus | { problem: 'finished-before-started' } {
  const next: ReadingStatus = { ...current, updatedAt: now.toISOString() };
  if (typed) next[field] = `${typed}T00:00:00.000Z`;
  else delete next[field];
  if (next.startedAt && next.finishedAt && next.finishedAt < next.startedAt) return { problem: 'finished-before-started' };
  return next;
}

export function currentStatus(work: string, library: Library): Status {
  return currentReadingStatus(work, library)?.status ?? 'unread';
}

// A status this app does not know (written by a newer client) counts as no record (ADR 0010).
function currentReadingStatus(work: string, library: Library): ReadingStatus | undefined {
  const value = library.readingStatuses.find(({ rkey }) => rkey === work)?.value;
  return value && statuses.includes(value.status) ? value : undefined;
}

// UNIMARC 101 $a and Open Library give ISO 639-2/B codes; Intl names BCP 47 ones.
const bcp47: Record<string, string> = { fre: 'fr', eng: 'en', jpn: 'ja', ger: 'de', spa: 'es', ita: 'it', kor: 'ko' };

// The name of an Edition Line (glossary): its publisher and the years of its
// Editions, "Glénat · 1993–2000" (ADR 0010, amendment 2026-11-14).
export function lineLabel(name: LineName, uiLanguage: Language = pageLanguage()): string {
  const years = name.first !== null && name.last !== null ? translator(uiLanguage)('series.line-years', name.first, name.last) : null;
  return [name.publisher, years].filter(Boolean).join(' · ');
}

// The book's language is named in the UI language: "French", "français".
export function editionLabel(edition: Edition | undefined, uiLanguage: Language = pageLanguage()): string {
  if (!edition) return '';
  return [edition.publisher, languageName(edition, uiLanguage), edition.format].filter(Boolean).join(' · ');
}

// The language of an Edition in the words of the UI ("French"), else its code as the source gave it.
export function languageName({ language }: Pick<Edition, 'language'>, uiLanguage: Language = pageLanguage()): string | null {
  const code = language && bcp47[language];
  return code ? (new Intl.DisplayNames(uiLanguage, { type: 'language' }).of(code) ?? language) : language;
}
