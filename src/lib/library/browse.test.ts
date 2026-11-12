import { describe, expect, test } from 'vitest';
import type { Edition } from '../catalog/catalog';
import { allBooks, browse, clearAll, libraryBooks, type LibraryBook, type LibraryQuery } from './browse';
import type { Copy } from './copy';
import type { Label } from './label';
import type { Library } from './model';
import type { ReadingStatus, Status } from './reading-status';
import type { Saved } from './records';

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
const series = (title: string) => ({ id: `wd:Q${title.length}`, title, sameAs: [] });

const asterix = edition('9782864976165', 'Astérix', {
  volumeTitle: 'L’Iris blanc',
  authors: ['Fabcaro', 'Didier Conrad'],
  series: series('Astérix'),
  volumes: [40],
  volume: 40,
  cover: 'https://example.org/asterix.jpg',
});
const onePiece9 = edition('9782723434621', 'One Piece', { authors: ['Eiichirō Oda'], series: series('One Piece'), volumes: [9], volume: 9 });
const onePiece105 = edition('9782344059500', 'One Piece', { authors: ['Eiichirō Oda'], series: series('One Piece'), volumes: [105], volume: 105 });
const dune = edition('9782266320481', 'Dune', { authors: ['Frank Herbert'] });
const horde = edition('9782070464234', 'La Horde du Contrevent', { authors: ['Alain Damasio'] });
// Its Series name is not in its title, so "Search in" can tell them apart.
const fondation = edition('9782070360536', 'Fondation', { authors: ['Isaac Asimov'], series: series('Le Cycle de Fondation'), volumes: [1], volume: 1 });

const editions = new Map([asterix, onePiece9, onePiece105, dune, horde, fondation].map((each) => [each.isbn, each]));
const work = (each: Edition) => each.work.id;

const copy = (each: Edition, createdAt: string, rkey = each.isbn): Saved<Copy> => ({ rkey, value: { isbn: each.isbn, works: [work(each)], createdAt } });
const status = (each: Edition, value: Status, updatedAt = '2026-11-01T00:00:00.000Z'): Saved<ReadingStatus> => ({
  rkey: work(each),
  value: { work: work(each), isbn: each.isbn, status: value, updatedAt },
});
const label = (rkey: string, name: string, works: Edition[]): Saved<Label> => ({
  rkey,
  value: { name, works: works.map(work), createdAt: '2026-11-01T00:00:00.000Z' },
});
const library = (change: Partial<Library> = {}): Library => ({ copies: [], readingStatuses: [], follows: [], loans: [], toBuy: [], ...change });

// The reader owns five books, added one day apart, and has read Fondation without owning it.
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
const labels = [label('3lbsf', 'Sci-fi', [dune, fondation, horde]), label('3lbma', 'Manga', [onePiece9, onePiece105])];
const books = libraryBooks(reader, editions, labels);

const find = (change: Partial<LibraryQuery>) => browse(books, labels, { ...allBooks, ...change }, 'fr');
// "One Piece 9": the title, and the Volume when it has one.
const names = (found: LibraryBook[]) => found.map(({ title, volume }) => (volume ? `${title} ${volume}` : title));

describe('Library books', () => {
  test('one book per Work the reader has a Copy of, with the Catalog details', () => {
    expect(libraryBooks(library({ copies: [copy(asterix, '2026-11-04T00:00:00.000Z')] }), editions, [])).toEqual([
      {
        work: work(asterix),
        title: 'Astérix',
        volumeTitle: 'L’Iris blanc',
        authors: ['Fabcaro', 'Didier Conrad'],
        series: 'Astérix',
        volume: '40',
        cover: '/api/catalog/editions/9782864976165/cover',
        status: 'unread',
        labels: [],
        addedAt: '2026-11-04T00:00:00.000Z',
      },
    ]);
  });

  test('a Work read and not owned is in the Library, added when its Reading Status was saved', () => {
    const [book] = libraryBooks(library({ readingStatuses: [status(fondation, 'read', '2026-10-01T00:00:00.000Z')] }), editions, []);

    expect([book.title, book.status, book.addedAt]).toEqual(['Fondation', 'read', '2026-10-01T00:00:00.000Z']);
  });

  test('a Work with two Copies is one book, added with its first Copy', () => {
    const twice = library({ copies: [copy(dune, '2026-11-09T00:00:00.000Z', 'b'), copy(dune, '2026-11-02T00:00:00.000Z', 'a')] });

    expect(libraryBooks(twice, editions, []).map(({ title, addedAt }) => [title, addedAt])).toEqual([['Dune', '2026-11-02T00:00:00.000Z']]);
  });

  test('an omnibus Copy gives one book per Work it contains', () => {
    const omnibus: Saved<Copy> = { rkey: 'o', value: { isbn: onePiece9.isbn, works: [work(onePiece9), work(onePiece105)], createdAt: '2026-11-01T00:00:00.000Z' } };

    expect(libraryBooks(library({ copies: [omnibus] }), editions, []).map((book) => book.work)).toEqual([work(onePiece9), work(onePiece105)]);
  });

  test('a book carries the keys of the Labels that list its Work', () => {
    expect(books.find((book) => book.title === 'Dune')?.labels).toEqual(['3lbsf']);
  });
});

describe('Search', () => {
  test('ignores accents and case: "asterix" and "ASTÉRIX" find "Astérix"', () => {
    expect(names(find({ text: 'asterix' }).books)).toEqual(['Astérix 40']);
    expect(names(find({ text: 'ASTÉRIX' }).books)).toEqual(['Astérix 40']);
  });

  test('splits French ligatures: "coeur" finds "Le Cœur cousu"', () => {
    const coeur = edition('9782742780716', 'Le Cœur cousu', { authors: ['Carole Martinez'] });
    const found = browse(libraryBooks(library({ copies: [copy(coeur, '2026-11-01T00:00:00.000Z')] }), new Map([...editions, [coeur.isbn, coeur]]), []), [], { ...allBooks, text: 'coeur' }, 'fr');

    expect(names(found.books)).toEqual(['Le Cœur cousu']);
  });

  test('every word must be found, in any field', () => {
    expect(names(find({ text: 'fabcaro iris' }).books)).toEqual(['Astérix 40']);
    expect(names(find({ text: 'fabcaro dune' }).books)).toEqual([]);
  });

  test.each([
    ['all', 'conrad', ['Astérix 40']],
    ['title', 'horde', ['La Horde du Contrevent']],
    ['title', 'damasio', []],
    ['author', 'damasio', ['La Horde du Contrevent']],
    ['author', 'horde', []],
    ['series', 'cycle', ['Fondation 1']],
    ['series', 'horde', []],
    ['volumeTitle', 'iris', ['Astérix 40']],
    ['volumeTitle', 'asterix', []],
  ] as const)('Search in %s: "%s"', (searchIn, text, expected) => {
    expect(names(find({ text, searchIn }).books)).toEqual(expected);
  });
});

describe('Sort', () => {
  test('title, A to Z, then Volume in number order', () => {
    expect(names(find({ sort: 'title' }).books)).toEqual(['Astérix 40', 'Dune', 'Fondation 1', 'La Horde du Contrevent', 'One Piece 9', 'One Piece 105']);
  });

  test('author: the surname of the first author, then title', () => {
    expect(names(find({ sort: 'author' }).books)).toEqual([
      'Fondation 1', // Isaac Asimov
      'La Horde du Contrevent', // Alain Damasio
      'Astérix 40', // Fabcaro
      'Dune', // Frank Herbert
      'One Piece 9', // Eiichirō Oda
      'One Piece 105',
    ]);
  });

  test('Series and Volume: a book of no Series goes by its title', () => {
    expect(names(find({ sort: 'series' }).books)).toEqual([
      'Astérix 40',
      'Dune',
      'La Horde du Contrevent',
      'Fondation 1', // Le Cycle de Fondation
      'One Piece 9',
      'One Piece 105',
    ]);
  });

  test('recently added: latest first', () => {
    expect(names(find({ sort: 'added' }).books)).toEqual(['One Piece 105', 'Astérix 40', 'One Piece 9', 'Dune', 'La Horde du Contrevent', 'Fondation 1']);
  });
});

describe('Filters', () => {
  test('author: a book with several authors is found by each', () => {
    expect(names(find({ author: 'Eiichirō Oda' }).books)).toEqual(['One Piece 9', 'One Piece 105']);
    expect(names(find({ author: 'Didier Conrad' }).books)).toEqual(['Astérix 40']);
  });

  test('Series', () => {
    expect(names(find({ series: 'One Piece' }).books)).toEqual(['One Piece 9', 'One Piece 105']);
  });

  test('Reading Status', () => {
    expect(names(find({ status: 'read' }).books)).toEqual(['Fondation 1', 'One Piece 9']);
    expect(names(find({ status: 'abandoned' }).books)).toEqual(['La Horde du Contrevent']);
  });

  test('Label', () => {
    expect(names(find({ label: '3lbma' }).books)).toEqual(['One Piece 9', 'One Piece 105']);
  });

  test('the filters add up', () => {
    expect(names(find({ label: '3lbsf', status: 'read' }).books)).toEqual(['Fondation 1']);
  });

  test('the authors and Series to pick from: every one in the Library, A to Z', () => {
    const { authors, series: names } = find({ text: 'dune' });

    expect(authors).toEqual(['Alain Damasio', 'Didier Conrad', 'Eiichirō Oda', 'Fabcaro', 'Frank Herbert', 'Isaac Asimov']);
    expect(names).toEqual(['Astérix', 'Le Cycle de Fondation', 'One Piece']);
  });

  test('Reading Status chips: all, then each status, with no "lent" chip; each counts the books the other filters leave', () => {
    expect(find({ label: '3lbsf', status: 'read' }).statuses).toEqual([
      { status: null, count: 3 },
      { status: 'unread', count: 0 },
      { status: 'reading', count: 1 },
      { status: 'read', count: 1 },
      { status: 'abandoned', count: 1 },
    ]);
  });

  test('Label chips: all, then each Label A to Z, each counting the books the other filters leave', () => {
    expect(find({ status: 'read', label: '3lbma' }).labels).toEqual([
      { label: null, name: '', count: 2 },
      { label: '3lbma', name: 'Manga', count: 1 },
      { label: '3lbsf', name: 'Sci-fi', count: 1 },
    ]);
  });
});

describe('Count and Clear all', () => {
  test('with no search and no filter, every book shows', () => {
    expect([find({}).books.length, find({}).total, find({}).filtered]).toEqual([6, 6, false]);
  });

  test('a search or a filter shows how many books of the Library are left', () => {
    const found = find({ series: 'One Piece' });

    expect([found.books.length, found.total, found.filtered]).toEqual([2, 6, true]);
  });

  test('Clear all drops the search, Search in and every filter, and keeps the sort', () => {
    const query: LibraryQuery = { text: 'oda', searchIn: 'author', sort: 'added', author: 'Eiichirō Oda', series: 'One Piece', status: 'read', label: '3lbma' };

    expect(clearAll(query)).toEqual({ ...allBooks, sort: 'added' });
    expect(find(clearAll(query)).filtered).toBe(false);
  });
});
