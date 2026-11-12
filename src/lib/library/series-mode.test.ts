import { describe, expect, test } from 'vitest';
import type { Edition } from '../catalog/catalog';
import { allBooks, browse, libraryBooks, type LibraryQuery } from './browse';
import type { Copy } from './copy';
import type { Library } from './model';
import type { ReadingStatus, Status } from './reading-status';
import type { Saved } from './records';
import { librarySeries, parseGrouping, seriesCards, type LibraryCard } from './series-mode';

const edition = (isbn: string, title: string, change: Partial<Edition> = {}): Edition => ({
  isbn,
  title,
  volumeTitle: null,
  authors: [],
  publisher: null,
  language: null,
  format: null,
  cover: null,
  work: { id: `wd:Q${isbn.slice(-6)}`, title },
  series: null,
  volumes: [],
  volume: null,
  sources: ['BnF'],
  fetchedAt: '2026-11-01T00:00:00.000Z',
  ...change,
});
const onePiece = { id: 'wd:Q673', title: 'One Piece', sameAs: [] };
const volume = (isbn: string, series: Edition['series'], number: number, change: Partial<Edition> = {}) =>
  edition(isbn, series!.title, { series, volumes: [number], volume: number, ...change });

const asterix = volume('9782864976165', { id: 'wd:Q8', title: 'Astérix', sameAs: [] }, 40, { authors: ['Fabcaro'] });
const onePiece9 = volume('9782723434621', onePiece, 9, { authors: ['Eiichirō Oda'] });
const onePiece105 = volume('9782344059500', onePiece, 105, { authors: ['Eiichirō Oda'] });
const dune = edition('9782266320481', 'Dune', { authors: ['Frank Herbert'] });
const horde = edition('9782070464234', 'La Horde du Contrevent', { authors: ['Alain Damasio'] });
const fondation = edition('9782070360536', 'Fondation', {
  authors: ['Isaac Asimov'],
  series: { id: 'wd:Q21', title: 'Le Cycle de Fondation', sameAs: [] },
  volumes: [1],
  volume: 1,
});

const work = (each: Edition) => each.work.id;
const copy = (each: Edition, createdAt = '2026-11-01T00:00:00.000Z'): Saved<Copy> => ({ rkey: each.isbn, value: { isbn: each.isbn, works: [work(each)], createdAt } });
const status = (each: Edition, value: Status, updatedAt = '2026-11-01T00:00:00.000Z'): Saved<ReadingStatus> => ({
  rkey: work(each),
  value: { work: work(each), isbn: each.isbn, status: value, updatedAt },
});
const library = (change: Partial<Library> = {}): Library => ({ copies: [], readingStatuses: [], follows: [], loans: [], toBuy: [], ...change });

// The Library in Series mode, as the screen asks for it: the cards of the books `query` finds.
function cards(reader: Library, known: Edition[], query: Partial<LibraryQuery> = {}): LibraryCard[] {
  const editions = new Map(known.map((each) => [each.isbn, each]));
  const books = libraryBooks(reader, editions, []);
  return seriesCards(browse(books, [], { ...allBooks, ...query }, 'fr').books, librarySeries(books, reader, editions));
}
// "One Piece (2 owned, 1 read)" for a Series, the title for a book.
const names = (found: LibraryCard[]) => found.map((card) => ('series' in card ? `${card.series.title} (${card.series.owned} owned, ${card.series.read} read)` : card.book.title));

// The reader owns five books, added one day apart, and has read Fondation without owning it.
const known = [asterix, onePiece9, onePiece105, dune, horde, fondation];
const reader = library({
  copies: [
    copy(horde, '2026-11-01T00:00:00.000Z'),
    copy(dune, '2026-11-02T00:00:00.000Z'),
    copy(onePiece9, '2026-11-03T00:00:00.000Z'),
    copy(asterix, '2026-11-04T00:00:00.000Z'),
    copy(onePiece105, '2026-11-05T00:00:00.000Z'),
  ],
  readingStatuses: [status(dune, 'reading'), status(onePiece9, 'read'), status(fondation, 'read', '2026-10-01T00:00:00.000Z'), status(horde, 'abandoned')],
});

describe('Series mode', () => {
  test('one card per Series; a book with no Series stays a book', () => {
    expect(names(cards(reader, known))).toEqual([
      'Astérix (1 owned, 0 read)',
      'Dune',
      'Le Cycle de Fondation (0 owned, 1 read)', // where its book "Fondation" stands
      'La Horde du Contrevent',
      'One Piece (2 owned, 1 read)',
    ]);
  });

  // The Catalog minted an identifier for Dragon Ball, then found it in
  // Wikidata: Editions it answered before and after name the Series differently.
  const minted = 'atomes:atomes.example:01HZX3YQ8N5V7K2M4P6R8T0W1B';
  const before = { id: minted, title: 'Dragon Ball', sameAs: [] };
  const after = { id: 'wd:Q2020', title: 'Dragon Ball', sameAs: [minted] };

  test('Volumes that name their Series by another of its identifiers (`sameAs`) are one Series', () => {
    const [one, two] = [volume('9782723434621', before, 1), volume('9782723434638', after, 2)];

    expect(names(cards(library({ copies: [copy(one), copy(two)] }), [one, two]))).toEqual(['Dragon Ball (2 owned, 0 read)']);
  });

  test('a Volume that links two identifiers joins the Volumes filed under each', () => {
    const other = 'inv:0123456789abcdef0123456789abcdef';
    const volumes = [
      volume('9782723434621', before, 1),
      volume('9782723434638', { id: other, title: 'Dragon Ball', sameAs: [] }, 2),
      volume('9782723434645', { ...after, sameAs: [minted, other] }, 3),
    ];

    expect(names(cards(library({ copies: volumes.map((each) => copy(each)) }), volumes))).toEqual(['Dragon Ball (3 owned, 0 read)']);
  });

  test('a book whose Series the Catalog does not identify stays a book, even with a Series name typed on its Copy', () => {
    const typed: Saved<Copy> = { rkey: 'a', value: { isbn: '9782505000013', works: ['isbn:9782505000013'], createdAt: '2026-11-01T00:00:00.000Z', details: { title: 'Blacksad 1', series: 'Blacksad' } } };

    expect(names(cards(library({ copies: [typed] }), []))).toEqual(['Blacksad 1']);
  });
});

describe('Series counts', () => {
  test('owned: the books of the Series the reader has a Copy of; read: the ones read, owned or not', () => {
    const [one, two, three] = [volume('9782723434621', onePiece, 1), volume('9782723434638', onePiece, 2), volume('9782723434645', onePiece, 3)];
    const stands = library({ copies: [copy(one), copy(two)], readingStatuses: [status(one, 'read'), status(two, 'reading'), status(three, 'read')] });

    expect(names(cards(stands, [one, two, three]))).toEqual(['One Piece (2 owned, 2 read)']);
  });

  test('an omnibus Copy counts each Work it contains', () => {
    const omnibus = volume('9782723434621', onePiece, 1, { volumes: [1, 2] });
    const second = 'wd:Q99';
    const owned: Saved<Copy> = { rkey: 'o', value: { isbn: omnibus.isbn, works: [work(omnibus), second], createdAt: '2026-11-01T00:00:00.000Z' } };

    expect(names(cards(library({ copies: [owned] }), [omnibus]))).toEqual(['One Piece (2 owned, 0 read)']);
  });
});

describe('Series cover', () => {
  const covered = (each: Edition) => ({ ...each, cover: 'https://example.org/cover.jpg' });
  const coverOf = (known: Edition[]) => {
    const [card] = cards(library({ copies: [copy(onePiece9), copy(onePiece105)] }), known);
    return 'series' in card && card.series.cover.isbn;
  };

  test('the lowest Volume the reader has', () => {
    expect(coverOf([onePiece105, onePiece9])).toBe(onePiece9.isbn);
    expect(coverOf([covered(onePiece105), covered(onePiece9)])).toBe(onePiece9.isbn);
  });

  test('else the lowest one with a cover', () => {
    expect(coverOf([onePiece9, covered(onePiece105)])).toBe(onePiece105.isbn);
  });
});

describe('Search, sort and filters in Series mode', () => {
  test('a search finds a Series by one of its books', () => {
    expect(names(cards(reader, known, { text: 'oda' }))).toEqual(['One Piece (2 owned, 1 read)']);
    expect(names(cards(reader, known, { text: 'fondation', searchIn: 'title' }))).toEqual(['Le Cycle de Fondation (0 owned, 1 read)']);
  });

  test('a filter keeps a Series when one of its books matches, with the counts of the whole Series', () => {
    // One Piece 9 is read, One Piece 105 is not.
    expect(names(cards(reader, known, { status: 'read' }))).toEqual(['Le Cycle de Fondation (0 owned, 1 read)', 'One Piece (2 owned, 1 read)']);
    expect(names(cards(reader, known, { author: 'Frank Herbert' }))).toEqual(['Dune']);
    expect(names(cards(reader, known, { series: 'One Piece' }))).toEqual(['One Piece (2 owned, 1 read)']);
  });

  test('no book found: no card', () => {
    expect(cards(reader, known, { text: 'zzz' })).toEqual([]);
  });

  test('sort: a Series stands where the first of its books found stands', () => {
    expect(names(cards(reader, known, { sort: 'series' }))).toEqual([
      'Astérix (1 owned, 0 read)',
      'Dune',
      'La Horde du Contrevent',
      'Le Cycle de Fondation (0 owned, 1 read)',
      'One Piece (2 owned, 1 read)',
    ]);
    // One Piece 105 is the latest book added.
    expect(names(cards(reader, known, { sort: 'added' }))).toEqual([
      'One Piece (2 owned, 1 read)',
      'Astérix (1 owned, 0 read)',
      'Dune',
      'La Horde du Contrevent',
      'Le Cycle de Fondation (0 owned, 1 read)',
    ]);
  });
});

describe('The Books / Series choice', () => {
  test('is Books until the reader picks Series; a value kept on the device that the app does not know is Books', () => {
    expect(parseGrouping(null)).toBe('books');
    expect(parseGrouping('series')).toBe('series');
    expect(parseGrouping('<img src=x>')).toBe('books');
  });
});
