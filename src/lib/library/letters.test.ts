import { describe, expect, test } from 'vitest';
import { allBooks, browse, type LibraryBook, type SortBy } from './browse';
import { letterGroups } from './letters';

const book = (title: string, change: Partial<LibraryBook> = {}): LibraryBook => ({
  work: `wd:${title}${change.volume ?? ''}`,
  title,
  volumeTitle: null,
  authors: [],
  series: null,
  volume: null,
  cover: null,
  status: 'unread',
  labels: [],
  addedAt: '2026-11-01T00:00:00.000Z',
  ...change,
});

// The List of a Library sorted as the toolbar asks, in French.
const list = (books: LibraryBook[], sort: SortBy = 'title') => letterGroups(browse(books, [], { ...allBooks, sort }, 'fr').books, sort, 'fr');
// "A: Astérix, Akira": each group with the titles under it.
const shown = (books: LibraryBook[], sort: SortBy = 'title') =>
  list(books, sort).groups.map(({ letter, books: under }) => `${letter}: ${under.map(({ title, volume }) => (volume ? `${title} ${volume}` : title)).join(', ')}`);

describe('Letter groups', () => {
  test('sorted by title: each book goes under the first letter of its title, A to Z', () => {
    expect(shown([book('Dune'), book('Fondation'), book('Akira'), book('Dracula')])).toEqual(['A: Akira', 'D: Dracula, Dune', 'F: Fondation']);
  });

  test('an accent, a small letter or a ligature goes under its plain letter: "Élise" under E, "Œuvres" under O', () => {
    expect(shown([book('Élise'), book('eau'), book('Œuvres'), book('Orlando'), book('Øye')])).toEqual(['E: eau, Élise', 'O: Œuvres, Orlando, Øye']);
  });

  test('"#" is one group, after Z, for every title that starts with no letter of A to Z: a digit, a sign, another script', () => {
    expect(shown([book('1984'), book('Zazie dans le métro'), book('進撃の巨人'), book('«Art»'), book('Akira')])).toEqual([
      'A: Akira',
      'Z: Zazie dans le métro',
      '#: «Art», 1984, 進撃の巨人',
    ]);
  });

  test('leading articles still count: "La Horde du Contrevent" and "L’Étranger" under L, "The Hobbit" under T', () => {
    expect(shown([book('The Hobbit'), book('La Horde du Contrevent'), book('Horde'), book('L’Étranger')])).toEqual([
      'H: Horde',
      'L: L’Étranger, La Horde du Contrevent',
      'T: The Hobbit',
    ]);
  });

  test('sorted by Series and Volume: under the first letter of the Series name, else of the title', () => {
    const fondation = book('Fondation', { series: 'Le Cycle de Fondation', volume: '1' });
    const onePiece = (volume: string) => book('One Piece', { series: 'One Piece', volume });

    expect(shown([onePiece('105'), fondation, book('Dune'), onePiece('9')], 'series')).toEqual(['D: Dune', 'L: Fondation 1', 'O: One Piece 9, One Piece 105']);
  });

  test('sorted by author: under the first letter of the surname of the first author; a book with no author under "#"', () => {
    const books = [
      book('La Horde du Contrevent', { authors: ['Alain Damasio'] }),
      book('Dune', { authors: ['Frank Herbert'] }),
      book('Astérix', { authors: ['Fabcaro', 'Didier Conrad'] }),
      book('Beowulf'),
      book('Fondation', { authors: ['Isaac Asimov'] }),
      book('Le Petit Prince', { authors: ['Antoine de Saint-Exupéry'] }),
      book('Tintin au Tibet', { authors: ['Hergé'] }),
    ];

    expect(shown(books, 'author')).toEqual([
      'A: Fondation',
      'D: La Horde du Contrevent',
      'F: Astérix',
      'H: Dune, Tintin au Tibet',
      'S: Le Petit Prince',
      '#: Beowulf',
    ]);
  });

  test('"Recently added" is one group with no letter, latest first', () => {
    const books = [book('Akira', { addedAt: '2026-11-02T00:00:00.000Z' }), book('Zazie dans le métro', { addedAt: '2026-11-03T00:00:00.000Z' }), book('1984', { addedAt: '2026-11-01T00:00:00.000Z' })];

    expect(shown(books, 'added')).toEqual(['null: Zazie dans le métro, Akira, 1984']);
  });

  test('no book, no group', () => {
    expect(shown([], 'title')).toEqual([]);
    expect(shown([], 'added')).toEqual([]);
  });
});

describe('Jump index', () => {
  test('lists A to Z, then "#"', () => {
    const { index } = list([book('Akira')]);

    expect(index.map(({ letter }) => letter).join('')).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ#');
  });

  test('a letter with books jumps to its group; a letter with none jumps nowhere', () => {
    const { groups, index } = list([book('Akira'), book('Dune'), book('Dracula'), book('1984')]);

    expect(index.filter(({ target }) => target !== null)).toEqual([
      { letter: 'A', target: 'letter-A' },
      { letter: 'D', target: 'letter-D' },
      { letter: '#', target: 'letter-other' },
    ]);
    expect(groups.map(({ target }) => target)).toEqual(['letter-A', 'letter-D', 'letter-other']);
  });

  test('follows the sort: by author, the letters of the surnames', () => {
    const { index } = list([book('Dune', { authors: ['Frank Herbert'] }), book('Fondation', { authors: ['Isaac Asimov'] })], 'author');

    expect(index.flatMap(({ letter, target }) => (target ? letter : []))).toEqual(['A', 'H']);
  });

  test('"Recently added" has no letter to jump to', () => {
    expect(list([book('Akira')], 'added').index).toEqual([]);
  });
});
