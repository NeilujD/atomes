// The Library in Series mode (the Books / Series switch): one card per Series
// in place of its books. Pure, as browse.ts; src/islands/Library.tsx renders it.
import type { Edition, Series } from '../catalog/catalog';
import type { LibraryBook } from './browse';
import { bookIsbns, isOwned, type Editions, type Library } from './model';
import { seriesCover } from './series';

// What the Library shows a card for: each book, or each Series.
export const groupings = ['books', 'series'] as const;
export type Grouping = (typeof groupings)[number];

export const groupingKey = 'atomes:library-grouping';

export function parseGrouping(value: string | null): Grouping {
  return groupings.find((grouping) => grouping === value) ?? 'books';
}

// The choice is kept on the device. Storage can be blocked (see
// appearance.ts): then the choice lasts for the page only.
export function readGrouping(): Grouping {
  try {
    return parseGrouping(localStorage.getItem(groupingKey));
  } catch {
    return 'books';
  }
}

export function saveGrouping(grouping: Grouping): void {
  try {
    localStorage.setItem(groupingKey, grouping);
  } catch {
    // See readGrouping.
  }
}

export interface LibrarySeries {
  title: string;
  // Series cover rule, among the books of the Library. Its ISBN opens the Series page (seriesHref).
  cover: Edition;
  // Books of the Library, not Volumes of the Series: no "of N", that would
  // need one Volumes lookup per Series.
  owned: number;
  read: number;
}

export type LibraryCard = { series: LibrarySeries } | { book: LibraryBook };

// The Series of each book of the Library that has one, by Work. A book with
// no Catalog Series is not here: it stays a book.
export function librarySeries(books: LibraryBook[], library: Library, editions: Editions): Map<string, LibrarySeries> {
  return new Map(
    seriesGroups(books, library, editions).flatMap((group) => {
      // seriesCover gives one of these Editions: found again here, so its Series stays typed.
      const inSeries = group.map(({ edition }) => edition);
      const picked = seriesCover(inSeries);
      const cover = inSeries.find((each) => each === picked) ?? inSeries[0];
      const series: LibrarySeries = {
        title: cover.series.title,
        cover,
        owned: group.filter(({ edition }) => isOwned(edition, library)).length,
        read: group.filter(({ book }) => book.status === 'read').length,
      };
      return group.map(({ book }): [string, LibrarySeries] => [book.work, series]);
    }),
  );
}

// The cards of the books found (browse), in their order: a Series stands where
// its first book found stands, so one book found is enough to show it, with
// the counts of all its books in the Library.
export function seriesCards(found: LibraryBook[], series: ReadonlyMap<string, LibrarySeries>): LibraryCard[] {
  const shown = new Set<LibrarySeries>();
  return found.flatMap((book): LibraryCard[] => {
    const its = series.get(book.work);
    if (!its) return [{ book }];
    if (shown.has(its)) return [];
    shown.add(its);
    return [{ series: its }];
  });
}

// A book of the Library with its Edition, which names its Series.
type InSeries = Edition & { series: Series };
interface Volume {
  book: LibraryBook;
  edition: InSeries;
}

// The books of each Series. A Series is known by its identifier and by its
// `sameAs` ones (ADR 0010): Editions the Catalog answered at different times
// can name the same Series differently, so two books are of one Series as
// soon as their Editions share an identifier, directly or through a third.
function seriesGroups(books: LibraryBook[], library: Library, editions: Editions): Volume[][] {
  let groups: { ids: string[]; volumes: Volume[] }[] = [];
  for (const book of books) {
    const edition = editionOf(book.work, library, editions);
    if (!edition || !hasSeries(edition)) continue;
    const ids = [edition.series.id, ...edition.series.sameAs];
    const same = groups.filter((group) => group.ids.some((id) => ids.includes(id)));
    groups = [
      ...groups.filter((group) => !same.includes(group)),
      { ids: [...same.flatMap((group) => group.ids), ...ids], volumes: [...same.flatMap((group) => group.volumes), { book, edition }] },
    ];
  }
  return groups.map(({ volumes }) => volumes);
}

function hasSeries(edition: Edition): edition is InSeries {
  return edition.series !== null;
}

// The Catalog's Edition of a book of the Library, as bookPage picks it: the
// one of this Work, else any it knows of the book's ISBNs.
function editionOf(work: string, library: Library, editions: Editions): Edition | undefined {
  const known = bookIsbns(work, library).flatMap((isbn) => editions.get(isbn) ?? []);
  return known.find((each) => each.work.id === work) ?? known[0];
}
