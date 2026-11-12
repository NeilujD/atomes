import { describe, expect, test } from 'vitest';
import { keptChoice } from './kept-choice';

describe('A choice kept on this device', () => {
  const { parse } = keptChoice('atomes:library-grouping', ['books', 'series'] as const, 'books');

  test('is the fallback until the reader picks; a kept value that the app does not know is the fallback', () => {
    expect(parse(null)).toBe('books');
    expect(parse('series')).toBe('series');
    expect(parse('<img src=x>')).toBe('books');
  });
});
