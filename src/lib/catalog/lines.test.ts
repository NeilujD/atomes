import { describe, expect, test } from 'vitest';
import { bookHeight, placeLine } from './lines';

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

describe('the Edition Line an Edition joins (ADR 0010, amendment 2026-11-12)', () => {
  const lines = [
    { line: '7|glenat|fre|18', editions: 30 },
    { line: '7|glenat|fre|21', editions: 3 },
  ];

  test('1 cm from a line stays in it; 2 cm or more makes another line', () => {
    expect(placeLine('7|glenat|fre', 19, lines)).toBe('7|glenat|fre|18');
    expect(placeLine('7|glenat|fre', 22, lines)).toBe('7|glenat|fre|21');
    expect(placeLine('7|glenat|fre', 26, lines)).toBe('7|glenat|fre|26');
  });

  test('an Edition with no size joins the line with the most Editions', () => {
    expect(placeLine('7|glenat|fre', undefined, lines)).toBe('7|glenat|fre|18');
    expect(placeLine('7|glenat|fre', undefined, [])).toBe('7|glenat|fre|');
  });
});
