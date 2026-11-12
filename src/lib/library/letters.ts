// List mode: the books of the Library under letters taken from the sort
// field. Pure; src/islands/LibraryList.tsx renders it.
import type { Language } from '../i18n/i18n';
import { sortName, type LibraryBook, type SortBy } from './browse';

export interface LetterGroup {
  // "A" to "Z" or "#"; null for the one group of "Recently added".
  letter: string | null;
  // The id of the group on the screen, for the jump index.
  target: string;
  books: LibraryBook[];
}

export interface Listed {
  groups: LetterGroup[];
  // A to Z, then "#": each letter jumps to its group, or nowhere (null) when
  // no book is under it. Empty for "Recently added".
  index: { letter: string; target: string | null }[];
}

const alphabet = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
// The group of the rest: a digit, a sign, another script. Always last.
export const otherLetters = '#';

// The text whose first letter names the group. Leading articles count
// ("La Horde du Contrevent" is under L): the sort does not skip them either.
const fields: Record<Exclude<SortBy, 'added'>, (book: LibraryBook) => string> = {
  title: (book) => book.title,
  author: (book) => sortName(book.authors[0] ?? ''),
  series: (book) => book.series ?? book.title,
};

// `books` come in the order of `sort` (browse), and keep it inside each group.
export function letterGroups(books: LibraryBook[], sort: SortBy, language: Language): Listed {
  if (sort === 'added') return { groups: books.length > 0 ? [{ letter: null, target: 'letter-added', books }] : [], index: [] };

  // Accents and case do not count, as in the sort: "é" and "E" are one letter.
  const { compare } = new Intl.Collator(language, { sensitivity: 'base' });
  const under = new Map<string, LibraryBook[]>();
  for (const book of books) {
    const key = letter(fields[sort](book), compare);
    const found = under.get(key);
    if (found) found.push(book);
    else under.set(key, [book]);
  }
  const target = (each: string) => `letter-${each === otherLetters ? 'other' : each}`;
  const letters = [...alphabet, otherLetters];
  return {
    groups: letters.flatMap((each) => (under.has(each) ? { letter: each, target: target(each), books: under.get(each)! } : [])),
    index: letters.map((each) => ({ letter: each, target: under.has(each) ? target(each) : null })),
  };
}

// The last letter the text does not sort before: "Œ" sorts as "oe", so under O.
function letter(text: string, compare: (a: string, b: string) => number): string {
  const first = [...text][0] ?? '';
  if (!/\p{Script=Latin}/u.test(first)) return otherLetters;
  return alphabet.findLast((each) => compare(each, first) <= 0) ?? otherLetters;
}
