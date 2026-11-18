// Statistics (ADR 0019): every number of the Statistics screen, of the Home
// card and of the share picture, in one plain object, so they cannot
// disagree. Pure and computed on the device: no I/O, no clock ("today" is an
// input). A stored day is the device-local day at midnight UTC (day.ts):
// its year and month are read from the string, never through a time zone.
import type { Edition } from '../catalog/catalog';
import { compareText, type Language } from '../i18n/i18n';
import { allBooks, browse, libraryBooks, type LibraryBook } from './browse';
import { dayOf } from './day';
import type { Label } from './label';
import type { Loan } from './loan';
import { workEdition, type Editions, type Library } from './model';
import { statuses, type Status } from './reading-status';
import type { Saved } from './records';

// A calendar year, or All time.
export type Period = 'all' | number;

export interface StatsQuery {
  period: Period;
  // The key of one Label; null for every book.
  label: string | null;
  ownedOnly: boolean;
}

export interface StatsInput {
  library: Library;
  editions: Editions;
  labels: Saved<Label>[];
  query: StatsQuery;
  language: Language;
  // The moment on the device; its local day is today.
  today: Date;
}

export const dimensions = ['series', 'authors', 'labels', 'publishers'] as const;
export type Dimension = (typeof dimensions)[number];

// The rows of RankedBars, and the reads with no name in the dimension (no
// Series, no author, no Label, publisher unknown) for its note.
export interface Ranked {
  rows: { name: string; value: number }[];
  outside: number;
}

export interface Statistics {
  // The lead number: the Works read in the period.
  read: number;
  // The Copies the reader still has, got in the period. An omnibus counts once.
  added: number;
  // The state of today, whatever the period (the filters apply).
  reading: number;
  // Owned-Unread (glossary).
  ownedUnread: number;
  // The state of today too: one row per Reading Status.
  libraryToday: { status: Status; count: number }[];
  // The line under it, the state of today too: the Copies the reader has (an
  // omnibus once), the Series of the Works owned (by name, as "Most read"),
  // and the Works read and not owned.
  owned: { copies: number; series: number; readNotOwned: number };
  columns: {
    // By month in a year, by year in All time.
    scale: 'month' | 'year';
    // `at`: "2026-01" by month, "2026" by year.
    groups: { at: string; read: number; added: number }[];
  };
  // The reads of the period (every read in All time), ranked by dimension.
  mostRead: Record<Dimension, Ranked>;
  loans: {
    // Copies lent today, whatever the period.
    lentNow: number;
    // Loans lent in the period.
    started: number;
    // Of the Loans returned in the period, in whole days; null when none came back.
    averageDays: number | null;
  };
  // The pages of the dated reads of the period (CORE-152). `atLeast` when
  // some have no page count: the tile says "at least n pages". Null when no
  // dated read of the period has one (or there is none): no tile.
  pagesRead: { pages: number; atLeast: boolean } | null;
  // Reads and Copies with no day: in All time totals, never in a column.
  undated: { reads: number; copies: number };
  // Each year with a finish day or an acquisition day, the latest first.
  years: number[];
  // The current year when it is offered, else All time.
  defaultPeriod: Period;
  // The Followed Series of today, whatever the period and the filters (a
  // Follow has no Label): the share picture shows it.
  followed: number;
}

export function statistics({ library, editions, labels, query, today, language }: StatsInput): Statistics {
  // The Label and "owned only" filters of the Library browse, so both screens
  // keep the same books (a Label deleted since filters nothing).
  const every = libraryBooks(library, editions, labels);
  const books = browse(every, labels, { ...allBooks, label: query.label, owned: query.ownedOnly || null }, language).books;
  const works = new Set(books.map(({ work }) => work));
  // A Copy is in when one of its Works is.
  const copies = library.copies.filter(({ value }) => value.works.some((work) => works.has(work)));
  const reads = readsOf(books, library);
  const finishDays = reads.map(({ finishedAt }) => finishedAt);
  const acquiredDays = copies.map(({ value }) => value.acquiredAt);
  const inPeriod = (stored: string | undefined) => query.period === 'all' || (stored !== undefined && year(stored) === query.period);
  // From the whole Library: a filter does not take a year away from the picker.
  const dated = [...readsOf(every, library).map(({ finishedAt }) => finishedAt), ...library.copies.map(({ value }) => value.acquiredAt)];
  const years = [...new Set(dated.flatMap((stored) => (stored === undefined ? [] : [year(stored)])))].sort((a, b) => b - a);
  const groups = query.period === 'all' ? yearsFrom(years) : monthsOf(query.period);
  const inGroup = (at: string) => (stored: string | undefined) => stored?.startsWith(at) ?? false;
  const currentYear = year(dayOf(today));

  return {
    read: finishDays.filter(inPeriod).length,
    added: acquiredDays.filter(inPeriod).length,
    reading: books.filter((book) => book.status === 'reading').length,
    ownedUnread: books.filter((book) => book.status === 'unread' && book.owned).length,
    libraryToday: statuses.map((status) => ({ status, count: books.filter((book) => book.status === status).length })),
    owned: {
      copies: copies.length,
      series: new Set(books.flatMap(({ owned, series }) => (owned && series !== null ? [series] : []))).size,
      readNotOwned: books.filter((book) => book.status === 'read' && !book.owned).length,
    },
    columns: {
      scale: query.period === 'all' ? 'year' : 'month',
      groups: groups.map((at) => ({ at, read: finishDays.filter(inGroup(at)).length, added: acquiredDays.filter(inGroup(at)).length })),
    },
    mostRead: mostRead(
      reads.filter(({ finishedAt }) => inPeriod(finishedAt)).map(({ book }) => book),
      (book) => ({
        series: book.series === null ? [] : [book.series],
        authors: book.authors,
        labels: book.labels.flatMap((rkey) => labels.find((each) => each.rkey === rkey)?.value.name ?? []),
        publishers: [workEdition(book.work, library, editions)?.publisher ?? []].flat(),
      }),
      language,
    ),
    loans: loanNumbers(
      library.loans.flatMap(({ value }) => (copies.some(({ rkey }) => rkey === value.copy) ? [value] : [])),
      inPeriod,
    ),
    pagesRead: pagesRead(
      reads.flatMap(({ book, finishedAt }) => (finishedAt !== undefined && inPeriod(finishedAt) ? [workEdition(book.work, library, editions)] : [])),
    ),
    undated: {
      reads: finishDays.filter((stored) => stored === undefined).length,
      copies: acquiredDays.filter((stored) => stored === undefined).length,
    },
    years,
    defaultPeriod: years.includes(currentYear) ? currentYear : 'all',
    followed: library.follows.filter(({ value }) => value.status === 'following').length,
  };
}

// Six rows per dimension, the most read first, ties in the text order of the
// language. A read counts once for each name it has (a Work by two authors),
// and outside when it has none.
function mostRead(books: LibraryBook[], namesOf: (book: LibraryBook) => Record<Dimension, string[]>, language: Language): Record<Dimension, Ranked> {
  const compare = compareText(language);
  const named = books.map(namesOf);
  return Object.fromEntries(
    dimensions.map((dimension) => {
      const counts = new Map<string, number>();
      for (const names of named) for (const name of new Set(names[dimension])) counts.set(name, (counts.get(name) ?? 0) + 1);
      const rows = [...counts]
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value || compare(a.name, b.name))
        .slice(0, 6);
      return [dimension, { rows, outside: named.filter((names) => names[dimension].length === 0).length }];
    }),
  ) as Record<Dimension, Ranked>;
}

// The Edition of each read. A read of one Work of an omnibus counts its share
// of the omnibus pages, so reading every Volume counts the book once.
function pagesRead(read: (Edition | undefined)[]): Statistics['pagesRead'] {
  const counts = read.map((edition) => (edition?.pages ? edition.pages / Math.max(1, edition.volumes.length) : undefined));
  const known = counts.filter((pages) => pages !== undefined);
  if (known.length === 0) return null;
  return { pages: Math.round(known.reduce((sum, pages) => sum + pages, 0)), atLeast: known.length < counts.length };
}

// The Loans of the Copies kept. A Loan holds the moment of the tap (`lend`,
// model.ts), not a stored day: its day is the day on the device.
function loanNumbers(loans: Loan[], inPeriod: (day: string) => boolean): Statistics['loans'] {
  const dayOfTap = (moment: string) => dayOf(new Date(moment));
  const returned = loans.flatMap(({ lentAt, returnedAt }) =>
    returnedAt !== undefined && inPeriod(dayOfTap(returnedAt)) ? [(Date.parse(dayOfTap(returnedAt)) - Date.parse(dayOfTap(lentAt))) / 86_400_000] : [],
  );
  return {
    // Two devices may each have opened a Loan of one Copy: it is lent once.
    lentNow: new Set(loans.filter(({ returnedAt }) => returnedAt === undefined).map(({ copy }) => copy)).size,
    started: loans.filter(({ lentAt }) => inPeriod(dayOfTap(lentAt))).length,
    averageDays: returned.length === 0 ? null : Math.round(returned.reduce((sum, days) => sum + days, 0) / returned.length),
  };
}

// A read is a Work read now, with its finish day if it has one. A day kept on
// a Work marked back to another status (a bulk mark keeps it) counts nowhere.
function readsOf(books: LibraryBook[], library: Library): { book: LibraryBook; finishedAt: string | undefined }[] {
  return books.flatMap((book) =>
    book.status === 'read' ? [{ book, finishedAt: library.readingStatuses.find(({ rkey }) => rkey === book.work)?.value.finishedAt }] : [],
  );
}

function year(stored: string): number {
  return Number(stored.slice(0, 4));
}

// "2026-01" to "2026-12".
function monthsOf(period: number): string[] {
  return Array.from({ length: 12 }, (_, at) => `${period}-${String(at + 1).padStart(2, '0')}`);
}

// Every year from the first to the last offered, so an empty year shows as a gap.
function yearsFrom(years: number[]): string[] {
  if (years.length === 0) return [];
  const first = Math.min(...years);
  return Array.from({ length: Math.max(...years) - first + 1 }, (_, at) => String(first + at));
}
