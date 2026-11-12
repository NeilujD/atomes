import { describe, expect, test } from 'vitest';
import type { Edition } from '../catalog/catalog';
import type { Copy } from './copy';
import type { Follow } from './follow';
import { editionWork } from './ids';
import type { Library } from './model';
import type { ReadingStatus } from './reading-status';
import type { Saved } from './records';
import { followedLine, shelfCheck } from './shelf-check';

const blacksad = { id: 'wd:Q1000001', title: 'Blacksad', sameAs: ['bnf:cb000000001'] };

// An ISBN-13 from its first 12 digits: the check digit makes the EAN-13 sum a multiple of 10.
const isbn = (twelve: string) => {
  const sum = [...twelve].reduce((total, digit, i) => total + Number(digit) * (i % 2 === 0 ? 1 : 3), 0);
  return `${twelve}${(10 - (sum % 10)) % 10}`;
};

const volume = (n: number, change: Partial<Edition> = {}): Edition => ({
  isbn: isbn(`979109999${String(n).padStart(3, '0')}`),
  title: 'Blacksad',
  volumeTitle: null,
  authors: ['Juan Díaz Canales'],
  publisher: 'Dargaud',
  language: 'fre',
  format: null,
  cover: null,
  work: { id: `wd:Q200000${n}`, title: `Blacksad ${n}` },
  series: blacksad,
  volumes: [n],
  volume: n,
  sources: ['BnF'],
  fetchedAt: '2026-11-06T10:00:00.000Z',
  ...change,
});
const line = [1, 2, 3, 4, 5, 6].map((n) => volume(n));
const standalone = volume(0, { isbn: isbn('978207036002'), work: { id: 'wd:Q3000001', title: 'Le Petit Prince' }, series: null, volumes: [], volume: null });

const copy = (edition: Pick<Edition, 'isbn' | 'work'>): Saved<Copy> => ({
  rkey: `copy-${edition.isbn}`,
  value: { isbn: edition.isbn, works: [edition.work.id], createdAt: '2026-11-06T11:00:00.000Z' },
});
const status = (edition: Pick<Edition, 'isbn' | 'work'>, chosen: ReadingStatus['status']): Saved<ReadingStatus> => ({
  rkey: edition.work.id,
  value: { work: edition.work.id, isbn: edition.isbn, status: chosen, updatedAt: '2026-11-07T10:00:00.000Z' },
});
const follow = (change: Partial<Follow> = {}): Saved<Follow> => ({
  rkey: blacksad.id,
  value: { series: blacksad.id, anchorIsbn: line[0].isbn, status: 'following', updatedAt: '2026-11-06T11:00:00.000Z', ...change },
});
const library = (change: Partial<Library> = {}): Library => ({ copies: [], readingStatuses: [], follows: [], loans: [], toBuy: [], ...change });

describe('shelfCheck', () => {
  test('owned: a Copy of the Edition, with the Reading Status of its Work', () => {
    const answer = shelfCheck(standalone.isbn, standalone, library({ copies: [copy(standalone)], readingStatuses: [status(standalone, 'reading')] }), undefined);

    expect(answer).toEqual({ kind: 'owned', status: 'reading', followed: null });
  });

  test('owned with no Reading Status is unread', () => {
    expect(shelfCheck(standalone.isbn, standalone, library({ copies: [copy(standalone)] }), undefined)).toMatchObject({ kind: 'owned', status: 'unread' });
  });

  test('owned through another Edition of the same Work', () => {
    const other = { ...standalone, isbn: isbn('978207040850') };

    expect(shelfCheck(other.isbn, other, library({ copies: [copy(standalone)] }), undefined).kind).toBe('owned');
  });

  test('owned: an ISBN the Catalog does not know, saved before as an `isbn:` Work', () => {
    const typed = isbn('978299999901');
    const saved = library({ copies: [copy({ isbn: typed, work: { id: editionWork(typed), title: '' } })] });

    expect(shelfCheck(typed, undefined, saved, undefined)).toEqual({ kind: 'owned', status: 'unread', followed: null });
  });

  test('read but not owned: a Reading Status and no Copy', () => {
    const answer = shelfCheck(standalone.isbn, standalone, library({ readingStatuses: [status(standalone, 'read')] }), undefined);

    expect(answer).toEqual({ kind: 'read', status: 'read', followed: null });
  });

  test('a borrowed book being read, or abandoned, is not owned either', () => {
    for (const chosen of ['reading', 'abandoned'] as const) {
      expect(shelfCheck(standalone.isbn, standalone, library({ readingStatuses: [status(standalone, chosen)] }), undefined)).toMatchObject({ kind: 'read', status: chosen });
    }
  });

  test('an unread Reading Status with no Copy is not in the Library', () => {
    expect(shelfCheck(standalone.isbn, standalone, library({ readingStatuses: [status(standalone, 'unread')] }), undefined).kind).toBe('new');
  });

  test('missing from a Followed Series: a Volume before the latest one owned', () => {
    const answer = shelfCheck(line[2].isbn, line[2], library({ copies: [copy(line[0]), copy(line[3])], follows: [follow()] }), line);

    expect(answer).toEqual({ kind: 'missing', status: 'unread', followed: blacksad });
  });

  test('a Missing Volume the reader read (borrowed) is still missing, and says it was read', () => {
    const answer = shelfCheck(
      line[2].isbn,
      line[2],
      library({ copies: [copy(line[0]), copy(line[3])], readingStatuses: [status(line[2], 'read')], follows: [follow()] }),
      line,
    );

    expect(answer).toEqual({ kind: 'missing', status: 'read', followed: blacksad });
  });

  test('missing through another printing of the same Volume number', () => {
    const omnibus = volume(3, { isbn: isbn('979109999903'), work: { id: 'wd:Q9000003', title: 'Blacksad 3-4' }, volumes: [3, 4] });
    const answer = shelfCheck(omnibus.isbn, omnibus, library({ copies: [copy(line[0]), copy(line[4])], follows: [follow()] }), line);

    expect(answer.kind).toBe('missing');
  });

  test('a Volume after the latest one owned is not missing, and names the Followed Series', () => {
    const answer = shelfCheck(line[5].isbn, line[5], library({ copies: [copy(line[0]), copy(line[3])], follows: [follow()] }), line);

    expect(answer).toEqual({ kind: 'new', status: 'unread', followed: blacksad });
  });

  test('a Series followed under another identifier (sameAs) is followed', () => {
    const sameAs = { ...follow({ series: 'bnf:cb000000001' }), rkey: 'bnf:cb000000001' };
    const answer = shelfCheck(line[1].isbn, line[1], library({ copies: [copy(line[3])], follows: [sameAs] }), line);

    expect(answer).toMatchObject({ kind: 'missing', followed: blacksad });
  });

  test('a Dropped Series is not followed: no Missing Volume', () => {
    const answer = shelfCheck(line[2].isbn, line[2], library({ copies: [copy(line[0]), copy(line[3])], follows: [follow({ status: 'dropped' })] }), line);

    expect(answer).toEqual({ kind: 'new', status: 'unread', followed: null });
  });

  test('a Followed Series whose Edition Line could not be asked: followed, but not called missing', () => {
    const answer = shelfCheck(line[2].isbn, line[2], library({ copies: [copy(line[0]), copy(line[3])], follows: [follow()] }), undefined);

    expect(answer).toEqual({ kind: 'new', status: 'unread', followed: blacksad });
  });

  test('not in the Library: no Copy, no Reading Status, no Followed Series', () => {
    expect(shelfCheck(standalone.isbn, standalone, library(), undefined)).toEqual({ kind: 'new', status: 'unread', followed: null });
  });

  test('an ISBN the Catalog does not know and the reader never saved', () => {
    expect(shelfCheck(isbn('978299999901'), undefined, library(), undefined)).toEqual({ kind: 'new', status: 'unread', followed: null });
  });

  test('owned wins over missing: a Copy of the Volume in a Followed Series', () => {
    const answer = shelfCheck(line[2].isbn, line[2], library({ copies: [copy(line[2]), copy(line[3])], follows: [follow()] }), line);

    expect(answer).toEqual({ kind: 'owned', status: 'unread', followed: blacksad });
  });
});

describe('followedLine', () => {
  test('the anchor of the Followed Series of the Edition, to ask its Edition Line', () => {
    expect(followedLine(line[2], library({ follows: [follow()] }))).toBe(line[0].isbn);
  });

  test('none for a Dropped Series, an Edition of no Series, or an unknown ISBN', () => {
    expect(followedLine(line[2], library({ follows: [follow({ status: 'dropped' })] }))).toBeUndefined();
    expect(followedLine(standalone, library({ follows: [follow()] }))).toBeUndefined();
    expect(followedLine(undefined, library({ follows: [follow()] }))).toBeUndefined();
  });
});
