import { describe, expect, test } from 'vitest';
import { allBooks } from './browse';
import { savedLibraryState, type LibraryState } from './library-state';

const kept: LibraryState = {
  query: { text: 'one', searchIn: 'title', sort: 'added', author: 'Eiichirō Oda', series: 'One Piece', status: 'read', label: 'sci-fi' },
  flow: { to: 11, works: 'wd:Q1 wd:Q2' },
  scroll: { page: 640, panel: 0 },
};

describe('savedLibraryState', () => {
  test('reads back the state the Library saved', () => {
    expect(savedLibraryState(structuredClone(kept))).toEqual(kept);
  });

  test('nothing saved (a new visit): every book, no Cover flow move, at the top', () => {
    for (const nothing of [undefined, null, 'one', 12]) {
      expect(savedLibraryState(nothing)).toEqual({ query: allBooks, flow: undefined, scroll: { page: 0, panel: 0 } });
    }
  });

  test('a part of the wrong type falls back to its default, the others stay', () => {
    const saved = {
      query: { ...kept.query, searchIn: 'isbn', status: 'lost', author: 12, sort: null, extra: 'x' },
      flow: { to: -1, works: 'wd:Q1' },
      scroll: { page: Number.NaN, panel: 'top' },
    };

    expect(savedLibraryState(saved)).toEqual({
      query: { ...kept.query, searchIn: 'all', status: null, author: null, sort: 'title' },
      flow: undefined,
      scroll: { page: 0, panel: 0 },
    });
  });
});
