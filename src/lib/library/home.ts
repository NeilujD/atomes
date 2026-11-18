// The Home sections: what the reader owns and has not read, what they are
// reading, and the numbers of the year. Pure, so the rules are tested in Node; src/islands/Home.tsx only
// renders them.
import { compareText, type Language } from '../i18n/i18n';
import type { LibraryBook } from './browse';
import type { Editions, Library } from './model';
import { statistics } from './stats';

// Owned-Unread (glossary): a Copy (`owned`, by ownsWork) and the Reading Status unread. The last added first.
export function ownedUnread(books: LibraryBook[], language: Language): LibraryBook[] {
  const compare = compareText(language);
  return books
    .filter((book) => book.status === 'unread' && book.owned)
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt) || compare(a.title, b.title));
}

// The Works being read, owned or not. The last started first: by the start
// day, else by the last change (a record with no day, ADR 0019).
export function readingNow(books: LibraryBook[], library: Library, language: Language): LibraryBook[] {
  const compare = compareText(language);
  const startedAt = (book: LibraryBook) => {
    const value = library.readingStatuses.find(({ rkey }) => rkey === book.work)?.value;
    return value?.startedAt ?? value?.updatedAt ?? '';
  };
  return books.filter((book) => book.status === 'reading').sort((a, b) => startedAt(b).localeCompare(startedAt(a)) || compare(a.title, b.title));
}

// The card of the year (spec M11, Q10): "read" and "added" of the current
// year, as the Statistics screen counts them for that year with no filter.
// No card for a Library with no read and no Copy.
export interface YearCard {
  year: number;
  read: number;
  added: number;
}

export function yearCard(library: Library, editions: Editions, today: Date, language: Language): YearCard | null {
  if (library.copies.length === 0 && !library.readingStatuses.some(({ value }) => value.status === 'read')) return null;
  const year = today.getFullYear();
  const { read, added } = statistics({ library, editions, labels: [], query: { period: year, label: null, ownedOnly: false }, language, today });
  return { year, read, added };
}
