// The Library in Series mode (the Books / Series switch): one card per Series
// in place of its books. Pure, as browse.ts; src/islands/Library.tsx renders it.
import type { Edition, Series } from '../catalog/catalog';
import { compareText, type Language } from '../i18n/i18n';
import type { LibraryBook, SortBy } from './browse';
import { isOwned, workEdition, type Editions, type Library } from './model';
import { seriesCover } from './series';

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
      const inSeries = group.map(({ edition }) => edition);
      // A group is never empty.
      const cover = seriesCover(inSeries) ?? inSeries[0];
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
// the counts of all its books in the Library. Sorted by title, a Series
// stands at its own title: its books can have other titles ("Fondation" in
// "Le Cycle de Fondation").
export function seriesCards(found: LibraryBook[], series: ReadonlyMap<string, LibrarySeries>, sort: SortBy, language: Language): LibraryCard[] {
  const shown = new Set<LibrarySeries>();
  const cards = found.flatMap((book): LibraryCard[] => {
    const its = series.get(book.work);
    if (!its) return [{ book }];
    if (shown.has(its)) return [];
    shown.add(its);
    return [{ series: its }];
  });
  if (sort !== 'title') return cards;
  const compare = compareText(language);
  const title = (card: LibraryCard) => ('series' in card ? card.series.title : card.book.title);
  // The sort is stable: two cards of one title keep the order of the books found.
  return cards.sort((a, b) => compare(title(a), title(b)));
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
    const edition = workEdition(book.work, library, editions);
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
