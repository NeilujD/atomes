import { describe, expect, test } from 'vitest';
import { bookHeight, lineName, placeLine, recordGroups, samePublisher } from './lines';

test.each([
  ['18 cm', 18],
  ['18 x 12 cm', 18],
  ['18,5 cm', 18.5],
  ['21 cm', 21],
  ['1 vol. (232 p.)', undefined],
  [null, undefined],
])('book size %s reads as %s cm', (format, height) => {
  expect(bookHeight(format)).toBe(height);
});

test.each([
  ['Dargaud Bénélux-Kana', 'Kana', true],
  ['Kana', 'Dargaud Bénélux-Kana', true],
  ['Pika édition', 'Pika', true],
  ['Glénat', 'glenat', true],
  ['Kana', 'Glénat', false],
  ['Dargaud Bénélux-Kana', 'Dupuis Benelux', false],
  ['', 'Kana', false],
])('publishers %s and %s are the same: %s', (a, b, same) => {
  expect(samePublisher(a, b)).toBe(same);
});

describe('the Edition Line an Edition joins (ADR 0010, amendment 2026-11-12)', () => {
  const lines = [
    { line: '7|glenat|fre|18', editions: 30 },
    { line: '7|glenat|fre|21', editions: 3 },
  ];

  test('1 cm from a line stays in it; 2 cm or more makes another line', () => {
    expect(placeLine('7|glenat|fre', 19, lines)).toBe('7|glenat|fre|18');
    expect(placeLine('7|glenat|fre', 22, lines)).toBe('7|glenat|fre|21');
    expect(placeLine('7|glenat|fre', 26, lines)).toBe('7|glenat|fre|26|');
  });

  test('an Edition with no size joins the line with the most Editions', () => {
    expect(placeLine('7|glenat|fre', undefined, lines)).toBe('7|glenat|fre|18');
    expect(placeLine('7|glenat|fre', undefined, [])).toBe('7|glenat|fre||');
  });
});

describe('BnF Series records that overlap are separate Edition Lines (ADR 0010, amendment 2026-11-14)', () => {
  const run = (record: string | undefined, from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => ({ record, volumes: [from + i] }));

  test('Dragon Ball: three records with the same Volume numbers are three groups, each named by its largest record', () => {
    const groups = recordGroups([...run('38839216', 1, 21), ...run('34338439', 1, 42), ...run('39250101', 3, 21)]);

    expect(groups).toEqual(
      new Map([
        ['34338439', '34338439'],
        ['38839216', '38839216'],
        ['39250101', '39250101'],
      ]),
    );
  });

  test('One Piece: a record that shares at most one Volume number joins the largest group', () => {
    const groups = recordGroups([...run('43702987', 1, 1), ...run('38888890', 1, 97), ...run('46917823', 98, 100)]);

    expect(groups).toEqual(
      new Map([
        ['38888890', '38888890'],
        ['43702987', '38888890'],
        ['46917823', '38888890'],
      ]),
    );
  });

  test('two shared Volume numbers start another group; Editions with no record join no group', () => {
    const groups = recordGroups([...run('a', 1, 10), ...run('quiz', 2, 3), ...run(undefined, 11, 12)]);

    expect(groups).toEqual(
      new Map([
        ['a', 'a'],
        ['quiz', 'quiz'],
      ]),
    );
  });
});

describe('the name of an Edition Line (ADR 0010, amendment 2026-11-14)', () => {
  const edition = (publisher: string | null, volume: number | null, year?: number | null) => ({ publisher, volume, year });

  test('the publisher most of its Editions name, and the first and last year of its Editions', () => {
    expect(lineName([edition('Kana', 50, 2010), edition('Dargaud Bénélux-Kana', 1, 2002), edition('Kana', 72, 2016)])).toEqual({
      publisher: 'Kana',
      first: 2002,
      last: 2016,
    });
  });

  test('Editions with no year leave the years out', () => {
    expect(lineName([edition('Glénat', 1), edition('Glénat', 2, null)])).toEqual({ publisher: 'Glénat', first: null, last: null });
    expect(lineName([edition('Glénat', 1, 1993), edition('Glénat', 2)])).toEqual({ publisher: 'Glénat', first: 1993, last: 1993 });
  });
});
