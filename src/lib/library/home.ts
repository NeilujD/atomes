// The Home sections: what the reader owns and has not read, and what they are
// reading. Pure, so the rules are tested in Node; src/islands/Home.tsx only
// renders them.
import { compareText, type Language } from '../i18n/i18n';
import type { LibraryBook } from './browse';
import type { Library } from './model';

// Owned-Unread (glossary): a Copy (`owned`, by ownsWork) and the Reading Status unread. The last added first.
export function ownedUnread(books: LibraryBook[], language: Language): LibraryBook[] {
  const compare = compareText(language);
  return books
    .filter((book) => book.status === 'unread' && book.owned)
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt) || compare(a.title, b.title));
}

// The Works being read, owned or not. The last started first.
export function readingNow(books: LibraryBook[], library: Library, language: Language): LibraryBook[] {
  const compare = compareText(language);
  const startedAt = (book: LibraryBook) => library.readingStatuses.find(({ rkey }) => rkey === book.work)?.value.updatedAt ?? '';
  return books.filter((book) => book.status === 'reading').sort((a, b) => startedAt(b).localeCompare(startedAt(a)) || compare(a.title, b.title));
}
