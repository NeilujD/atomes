import { describe, expect, test } from 'vitest';
import type { Edition } from '../catalog/catalog';
import type { Copy } from './copy';
import type { Follow } from './follow';
import { editionWork } from './ids';
import type { Library } from './model';
import type { ReadingStatus } from './reading-status';
import type { Saved } from './records';
import type { DeviceCatalog } from '../catalog/device';
import { catalogAnswer, deviceShelfCheck, followedLine, keptOnDevice, shelfCheck } from './shelf-check';

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

    expect(answer).toMatchObject({ kind: 'missing', status: 'unread', followed: blacksad });
  });

  test('missing comes with the spine row of the Edition Line: owned, read, not owned', () => {
    const answer = shelfCheck(
      line[2].isbn,
      line[2],
      library({ copies: [copy(line[0]), copy(line[3])], readingStatuses: [status(line[0], 'read')], follows: [follow()] }),
      line,
    );

    expect(answer.spines?.map(({ volume, state }) => `${volume} ${state}`)).toEqual([
      '1 read',
      '2 not-owned',
      '3 not-owned',
      '4 owned',
      '5 not-owned',
      '6 not-owned',
    ]);
  });

  test('a Missing Volume the reader read (borrowed) is still missing, and says it was read', () => {
    const answer = shelfCheck(
      line[2].isbn,
      line[2],
      library({ copies: [copy(line[0]), copy(line[3])], readingStatuses: [status(line[2], 'read')], follows: [follow()] }),
      line,
    );

    expect(answer).toMatchObject({ kind: 'missing', status: 'read', followed: blacksad });
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

// The Catalog data kept on this device (src/lib/catalog/device.ts), in memory.
function device(editions: Edition[], lines: Record<string, Edition[]> = {}): DeviceCatalog {
  return {
    edition: (isbn) => Promise.resolve(editions.find((each) => each.isbn === isbn)),
    line: (anchor) => Promise.resolve(lines[anchor]),
    hasCover: () => Promise.resolve(false),
  };
}
const kept = device([standalone, line[0], line[3]], { [line[0].isbn]: line });

describe('deviceShelfCheck: the answer with no network, from this device only', () => {
  test('owned, with its Reading Status', async () => {
    const answer = await deviceShelfCheck(standalone.isbn, library({ copies: [copy(standalone)], readingStatuses: [status(standalone, 'reading')] }), kept);

    expect(answer).toEqual({ check: { kind: 'owned', status: 'reading', followed: null }, edition: standalone });
  });

  test('owned through another Edition of the same Work, kept on this device', async () => {
    const other = { ...standalone, isbn: isbn('978207040850') };
    const answer = await deviceShelfCheck(other.isbn, library({ copies: [copy(standalone)] }), device([other]));

    expect(answer.check.kind).toBe('owned');
  });

  test('read but not owned', async () => {
    const answer = await deviceShelfCheck(standalone.isbn, library({ readingStatuses: [status(standalone, 'read')] }), kept);

    expect(answer.check).toEqual({ kind: 'read', status: 'read', followed: null });
  });

  test('missing from a Followed Series, with the spine row, for a Volume known only from its Edition Line', async () => {
    const answer = await deviceShelfCheck(line[2].isbn, library({ copies: [copy(line[0]), copy(line[3])], follows: [follow()] }), kept);

    expect(answer.edition).toEqual(line[2]);
    expect(answer.check).toMatchObject({ kind: 'missing', status: 'unread', followed: blacksad });
    expect(answer.check.spines?.map(({ volume, state }) => `${volume} ${state}`)).toEqual([
      '1 owned',
      '2 not-owned',
      '3 not-owned',
      '4 owned',
      '5 not-owned',
      '6 not-owned',
    ]);
  });

  test('the Volume in a kept Edition Line wins over an older kept answer for its ISBN (no Series then)', async () => {
    const older = { ...line[2], series: null };
    const answer = await deviceShelfCheck(line[2].isbn, library({ copies: [copy(line[0]), copy(line[3])], follows: [follow()] }), device([older], { [line[0].isbn]: line }));

    expect(answer.check.kind).toBe('missing');
    expect(answer.edition).toEqual(line[2]);
  });

  test('a Volume after the latest one owned: not in the Library, and names the Followed Series', async () => {
    const answer = await deviceShelfCheck(line[5].isbn, library({ copies: [copy(line[0]), copy(line[3])], follows: [follow()] }), kept);

    expect(answer.check).toEqual({ kind: 'new', status: 'unread', followed: blacksad });
  });

  test('a book this device knows, in no Followed Series and not in the Library', async () => {
    const answer = await deviceShelfCheck(standalone.isbn, library(), kept);

    expect(answer.check).toEqual({ kind: 'new', status: 'unread', followed: null });
  });

  test('a book this device does not know: not in your Library, check online later', async () => {
    const answer = await deviceShelfCheck('9791099999993', library({ copies: [copy(standalone)], follows: [follow()] }), kept);

    expect(answer).toEqual({ check: { kind: 'unknown', status: 'unread', followed: null }, edition: undefined });
  });

  test('a Volume of a Followed Series whose Edition Line is not on this device: never called new, check online later', async () => {
    const answer = await deviceShelfCheck(line[3].isbn, library({ copies: [copy(line[0])], follows: [follow()] }), device([line[3]]));

    expect(answer.check.kind).toBe('unknown');
  });

  test('a Copy of exactly this ISBN is owned, even with no Catalog data on this device', async () => {
    const saved = library({ copies: [copy(standalone)], readingStatuses: [status(standalone, 'read')] });

    expect((await deviceShelfCheck(standalone.isbn, saved, device([]))).check).toEqual({ kind: 'owned', status: 'read', followed: null });
  });

  test('a Reading Status of exactly this ISBN is read, even with no Catalog data on this device', async () => {
    const saved = library({ readingStatuses: [status(standalone, 'abandoned')] });

    expect((await deviceShelfCheck(standalone.isbn, saved, device([]))).check).toEqual({ kind: 'read', status: 'abandoned', followed: null });
  });

  test('a Dropped Series is not read for its Edition Line', async () => {
    const lines: string[] = [];
    const watched: DeviceCatalog = {
      edition: () => Promise.resolve(undefined),
      line: (anchor) => (lines.push(anchor), Promise.resolve(line)),
      hasCover: () => Promise.resolve(false),
    };

    await deviceShelfCheck(line[2].isbn, library({ follows: [follow({ status: 'dropped' })] }), watched);

    expect(lines).toEqual([]);
  });
});

describe('keptOnDevice: what the device keeps for Shelf Check offline', () => {
  test('the Editions of the Copies and Reading Statuses, and the anchors of the Followed Series', () => {
    const dropped = { ...follow({ series: 'wd:Q9', anchorIsbn: standalone.isbn, status: 'dropped' }), rkey: 'wd:Q9' };
    const kept = keptOnDevice(
      library({ copies: [copy(line[0]), copy(line[0])], readingStatuses: [status(standalone, 'read')], follows: [follow(), dropped] }),
    );

    expect(kept).toEqual({ isbns: [line[0].isbn, standalone.isbn], anchors: [line[0].isbn] });
  });
});

describe('catalogAnswer: no ISBN leaves the device while offline', () => {
  const found = { found: standalone };

  test('online: the Catalog answers', async () => {
    const asked: string[] = [];

    expect(await catalogAnswer(standalone.isbn, true, (each) => (asked.push(each), Promise.resolve(found)))).toEqual(found);
    expect(asked).toEqual([standalone.isbn]);
  });

  test('offline: the Catalog is not asked at all', async () => {
    const asked: string[] = [];

    expect(await catalogAnswer(standalone.isbn, false, (each) => (asked.push(each), Promise.resolve(found)))).toEqual({ offline: true });
    expect(asked).toEqual([]);
  });

  test('the network fails on the way: answered on the device, and nothing is kept to send later', async () => {
    let calls = 0;
    const failing = () => (calls++, Promise.reject(new TypeError('Failed to fetch')));

    expect(await catalogAnswer(standalone.isbn, true, failing)).toEqual({ offline: true });
    expect(calls).toBe(1);
  });

  test('any other failure is not hidden as offline', async () => {
    await expect(catalogAnswer(standalone.isbn, true, () => Promise.reject(new Error('Bad JSON')))).rejects.toThrow('Bad JSON');
  });
});
