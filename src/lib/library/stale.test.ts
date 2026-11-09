import { describe, expect, test } from 'vitest';
import type { Edition, Lookup } from '../catalog/catalog';
import { memorySpace } from './memory-space.fake';
import { staleNotice } from './stale';

const isbn = '9782723478991';
const catalog = (title: string) => (asked: string): Promise<Lookup> =>
  Promise.resolve(asked === isbn ? { found: { isbn, title } as Edition } : { notFound: true });
const offline = (): Promise<Lookup> => Promise.reject(new TypeError('Failed to fetch'));
const notice = (book: string) =>
  `${book} was changed on another device first. That change is kept, and the change made here is not saved.`;

describe('the notice of a stale write names the book', () => {
  test('a Reading Status: the Catalog title of its Edition', async () => {
    const { space } = memorySpace();
    const write = { collection: 'app.atomes.readingStatus', rkey: 'r', value: { isbn, work: 'wd:Q1', status: 'read' } };

    expect(await staleNotice(write, { space, lookup: catalog('One Piece 12') })).toBe(notice('One Piece 12'));
  });

  test('a Copy the Catalog does not know: the title the reader typed', async () => {
    const { space } = memorySpace();
    const write = { collection: 'app.atomes.copy', rkey: 'c', value: { isbn, details: { title: 'Zine' } } };

    expect(await staleNotice(write, { space, lookup: offline })).toBe(notice('Zine'));
  });

  test('a Loan: the book of its Copy', async () => {
    const { space } = memorySpace();
    await space.put('app.atomes.copy', 'c', { isbn, works: ['wd:Q1'] });
    const write = { collection: 'app.atomes.loan', rkey: 'l', value: { copy: 'c', borrower: 'Sam' } };

    expect(await staleNotice(write, { space, lookup: catalog('One Piece 12') })).toBe(notice('One Piece 12'));
  });

  test('with no Catalog answer (offline): the ISBN', async () => {
    const { space } = memorySpace();
    const write = { collection: 'app.atomes.follow', rkey: 'f', value: { anchorIsbn: isbn, series: 'One Piece' } };

    expect(await staleNotice(write, { space, lookup: offline })).toBe(notice(`ISBN ${isbn}`));
  });
});
