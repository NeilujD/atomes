// The Library in Grid, List and Cover flow: one book per Work, and the shared
// toolbar (search, Search in, Sort, filters, count, Clear all). Pure, so the
// rules are tested in Node; src/islands/Library.tsx only renders them.
import { compareText, t, type Language } from '../i18n/i18n';
import { labelsAtoZ, type Label } from './label';
import { bookPage, type Editions, type Library } from './model';
import { statuses, type Status } from './reading-status';
import type { Saved } from './records';

export interface LibraryBook {
  work: string;
  title: string;
  volumeTitle: string | null;
  authors: string[];
  series: string | null;
  volume: string | null;
  // A path on the Atomes server.
  cover: string | null;
  status: Status;
  // The keys of the Labels that list this Work.
  labels: string[];
  // Its first Copy, else its Reading Status for a Work the reader does not own.
  addedAt: string;
}

// The Volume of a book as every mode writes it, "Volume 9"; empty for a book with no Volume.
export function volumeLine({ volume }: Pick<LibraryBook, 'volume'>): string {
  return volume ? t('book.volume', volume) : '';
}

// The Library: every Work the reader has a Copy of or a Reading Status for.
export function libraryBooks(library: Library, editions: Editions, labels: Saved<Label>[]): LibraryBook[] {
  const works = new Set([...library.copies.flatMap(({ value }) => value.works), ...library.readingStatuses.map(({ rkey }) => rkey)]);
  return [...works].flatMap((work) => {
    const page = bookPage(work, library, editions);
    if (!page) return [];
    const copies = library.copies.filter(({ value }) => value.works.includes(work)).map(({ value }) => value.createdAt);
    const statusAt = library.readingStatuses.find(({ rkey }) => rkey === work)?.value.updatedAt ?? '';
    return {
      work,
      title: page.title,
      volumeTitle: page.volumeTitle,
      authors: page.authors,
      series: page.series,
      volume: page.volume,
      cover: page.cover,
      status: page.status,
      labels: labels.filter(({ value }) => value.works.includes(work)).map(({ rkey }) => rkey),
      addedAt: copies.length > 0 ? copies.reduce((first, each) => (each < first ? each : first)) : statusAt,
    };
  });
}

export type SearchIn = 'all' | 'title' | 'author' | 'series' | 'volumeTitle';
export type SortBy = 'title' | 'author' | 'series' | 'added';

// What the toolbar asks for. A null filter takes every book.
export interface LibraryQuery {
  text: string;
  searchIn: SearchIn;
  sort: SortBy;
  author: string | null;
  series: string | null;
  status: Status | null;
  label: string | null;
}

export const allBooks: LibraryQuery = { text: '', searchIn: 'all', sort: 'title', author: null, series: null, status: null, label: null };

// Clear all keeps the order the reader picked: it is not a filter.
export function clearAll(query: LibraryQuery): LibraryQuery {
  return { ...allBooks, sort: query.sort };
}

// The query the reader's Labels still allow: a Label deleted since the reader
// picked it (on this device or another) filters nothing, so it leaves the
// query. The count of filters on and the chips then read the same query.
export function liveQuery(query: LibraryQuery, labels: Saved<Label>[]): LibraryQuery {
  return query.label === null || labels.some(({ rkey }) => rkey === query.label) ? query : { ...query, label: null };
}

export interface Browsed {
  // The books found, in the order asked.
  books: LibraryBook[];
  total: number;
  // A search or a filter is on: the count says "n of total".
  filtered: boolean;
  // Every author and Series of the Library, A to Z, to filter by.
  authors: string[];
  series: string[];
  // Each chip counts the books the other filters leave; null is "all".
  statuses: { status: Status | null; count: number }[];
  labels: { label: string | null; name: string; count: number }[];
}

export function browse(books: LibraryBook[], labels: Saved<Label>[], asked: LibraryQuery, language: Language): Browsed {
  const query = liveQuery(asked, labels);
  const compare = compareText(language);
  const words = fold(query.text).split(/\s+/).filter(Boolean);
  const searched = (book: LibraryBook) => {
    const found = fold(searchedText(book, query.searchIn));
    return words.every((word) => found.includes(word));
  };
  // Every filter but `skip`, so a chip can count what choosing it would give.
  const kept = (skip?: 'status' | 'label') =>
    books.filter(
      (book) =>
        searched(book) &&
        (query.author === null || book.authors.includes(query.author)) &&
        (query.series === null || book.series === query.series) &&
        (skip === 'status' || query.status === null || book.status === query.status) &&
        (skip === 'label' || query.label === null || book.labels.includes(query.label)),
    );

  const forStatus = kept('status');
  const forLabel = kept('label');
  const { text, author, series, status, label } = query;
  return {
    books: kept().sort(order(query.sort, compare)),
    total: books.length,
    filtered: text.trim() !== '' || [author, series, status, label].some((each) => each !== null),
    authors: [...new Set(books.flatMap((book) => book.authors))].sort(compare),
    series: [...new Set(books.flatMap((book) => book.series ?? []))].sort(compare),
    statuses: [null, ...statuses].map((each) => ({
      status: each,
      count: each === null ? forStatus.length : forStatus.filter((book) => book.status === each).length,
    })),
    labels: [
      { label: null, name: '', count: forLabel.length },
      ...labelsAtoZ(labels, language).map(({ rkey, value }) => ({ label: rkey, name: value.name, count: forLabel.filter((book) => book.labels.includes(rkey)).length })),
    ],
  };
}

function searchedText(book: LibraryBook, searchIn: SearchIn): string {
  const fields: Record<Exclude<SearchIn, 'all'>, string> = {
    title: book.title,
    author: book.authors.join(' '),
    series: book.series ?? '',
    volumeTitle: book.volumeTitle ?? '',
  };
  return searchIn === 'all' ? Object.values(fields).join(' ') : fields[searchIn];
}

// "asterix" finds "Astérix", "coeur" finds "Cœur": no accents, no case, ligatures split.
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae');
}

// An author as the sort reads the name: the surname first, "Herbert Frank".
// The Catalog gives "Frank Herbert", so the surname is the last word; a
// particle stays behind ("Antoine de Saint-Exupéry" goes under S).
export function sortName(author: string): string {
  const words = author.trim().split(/\s+/);
  return [words.at(-1), ...words.slice(0, -1)].join(' ');
}

type Compare = (a: string, b: string) => number;

function order(sort: SortBy, compare: Compare): (a: LibraryBook, b: LibraryBook) => number {
  const byTitle = (a: LibraryBook, b: LibraryBook) => compare(a.title, b.title) || compare(a.volume ?? '', b.volume ?? '');
  switch (sort) {
    case 'title':
      return byTitle;
    // By surname. A book with no author goes last.
    case 'author':
      return (a, b) => missingLast(a.authors[0], b.authors[0], (first, second) => compare(sortName(first), sortName(second))) || byTitle(a, b);
    case 'series':
      return (a, b) => compare(a.series ?? a.title, b.series ?? b.title) || compare(a.volume ?? '', b.volume ?? '') || byTitle(a, b);
    case 'added':
      return (a, b) => b.addedAt.localeCompare(a.addedAt) || byTitle(a, b);
  }
}

function missingLast(a: string | undefined, b: string | undefined, compare: Compare): number {
  if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? 1 : -1;
  return compare(a, b);
}
