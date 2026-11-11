import { describe, expect, test } from 'vitest';
import type { Edition } from '../catalog/catalog';
import { copyCollection, saveCopy, type Copy } from './copy';
import type { Follow } from './follow';
import { loadLibrary } from './library';
import { memorySpace } from './memory-space.fake';
import type { Library } from './model';
import { lexicons, type Saved } from './records';
import { missingVolumes } from './series';
import { bought, bySeries, deleteToBuy, handAdd, listToBuy, saveToBuy, toBuyCollection, toBuyList, type ToBuy } from './to-buy';

describe('To Buy records', () => {
  test('an Edition added by hand matches its lexicon and is on the list once', async () => {
    const { space, stored } = memorySpace();

    await saveToBuy(space, { isbn: '9791043306471', createdAt: '2026-11-05T10:00:00.000Z' });
    await saveToBuy(space, { isbn: '9791043306471', createdAt: '2026-11-06T10:00:00.000Z' });

    const records = stored(toBuyCollection);
    expect(records.map(({ rkey }) => rkey)).toEqual(['9791043306471']);
    expect(() => lexicons.assertValidRecord(toBuyCollection, records[0].value)).not.toThrow();
    expect((await listToBuy(space)).records).toHaveLength(1);
  });

  test.each(['9791043306472', '979-10-433-0647-1', ''])('%s is refused and nothing is saved', async (isbn) => {
    const { space, stored } = memorySpace();

    await expect(saveToBuy(space, { isbn, createdAt: '2026-11-05T10:00:00.000Z' })).rejects.toThrow();
    expect(stored(toBuyCollection)).toEqual([]);
  });
});

const blacksad = { id: 'wd:Q1000001', title: 'Blacksad', sameAs: [] };
const isbns = ['9791099999016', '9791099999023', '9791099999030', '9791099999047', '9791099999054'];

// Volumes 1 to 5 of one Edition Line, as the Catalog answers `/volumes`.
const volume = (n: number, change: Partial<Edition> = {}): Edition => ({
  isbn: isbns[n - 1],
  title: 'Blacksad',
  volumeTitle: null,
  authors: ['Juan Díaz Canales'],
  publisher: 'Dargaud',
  language: 'fre',
  format: null,
  cover: null,
  work: { id: `wd:Q200000${n}`, title: `Blacksad ${n}` },
  series: blacksad,
  volume: n,
  sources: ['BnF'],
  fetchedAt: '2026-11-06T10:00:00.000Z',
  ...change,
});
const line = [1, 2, 3, 4, 5].map((n) => volume(n));
// By anchor ISBN, as the island asks `/volumes`.
const lines = new Map([[isbns[0], line]]);
const now = new Date('2026-11-10T12:00:00.000Z');

const copyOf = (isbn: string, works: string[], rkey = `copy-${isbn}`): Saved<Copy> => ({
  rkey,
  value: { isbn, works, createdAt: '2026-11-06T11:00:00.000Z' },
});
const owns = (...numbers: number[]) => numbers.map((n) => copyOf(isbns[n - 1], [volume(n).work.id]));
const follow = (status: Follow['status'], series = blacksad.id, anchorIsbn = isbns[0], fromVolume?: string): Saved<Follow> => ({
  rkey: series,
  value: { series, anchorIsbn, ...(fromVolume === undefined ? {} : { fromVolume }), status, updatedAt: '2026-11-06T11:00:00.000Z' },
});
const toBuy = (isbn: string, createdAt = '2026-11-07T10:00:00.000Z'): Saved<ToBuy> => ({ rkey: isbn, value: { isbn, createdAt } });
const library = (change: Partial<Library> = {}): Library => ({ copies: [], readingStatuses: [], follows: [], loans: [], toBuy: [], ...change });

const missingIsbns = (each: Library) => toBuyList(each, lines, new Map(), 'en').missing.map(({ isbn }) => isbn);

describe('Missing Volumes on To Buy', () => {
  test('a Followed Series: the Volumes before the latest one owned that the reader does not own', () => {
    expect(missingIsbns(library({ follows: [follow('following')], copies: owns(1, 4) }))).toEqual([isbns[1], isbns[2]]);
  });

  test('a Missing Volume shows what the Catalog knows of it, and is not a hand-added item', () => {
    const [item] = toBuyList(library({ follows: [follow('following')], copies: owns(1, 3) }), lines, new Map(), 'en').missing;

    expect(item).toEqual({
      isbn: isbns[1],
      work: 'wd:Q2000002',
      title: 'Blacksad',
      seriesId: 'wd:Q1000001',
      series: 'Blacksad',
      volume: 2,
      cover: null,
      edition: 'Dargaud · French',
      byHand: false,
    });
  });

  test('a bought Missing Volume leaves the list', () => {
    const before = library({ follows: [follow('following')], copies: owns(1, 4) });
    const [first] = toBuyList(before, lines, new Map(), 'en').missing;

    const { copy } = bought(first, now);
    const after = { ...before, copies: [...before.copies, { rkey: 'new', value: copy }] };

    expect(missingIsbns(after)).toEqual([isbns[2]]);
  });

  test('a dropped Series, or one never followed, shows no Missing Volume', () => {
    expect(missingIsbns(library({ follows: [follow('dropped')], copies: owns(1, 4) }))).toEqual([]);
    expect(missingIsbns(library({ copies: owns(1, 4) }))).toEqual([]);
  });

  test('nothing after the latest Volume owned is missing: those are New Volumes, not Missing ones', () => {
    expect(missingIsbns(library({ follows: [follow('following')], copies: owns(1, 2, 3) }))).toEqual([]);
  });

  test('a Followed Series whose Edition Line the Catalog could not give shows nothing', () => {
    const each = library({ follows: [follow('following')], copies: owns(1, 4) });

    expect(toBuyList(each, new Map(), new Map(), 'en').missing).toEqual([]);
  });

  test('after a switch "from Volume 4 in line B": line A before 4, line B from 4 on', () => {
    const lineB = [1, 2, 3, 4, 5].map((n) => volume(n, { isbn: `978150670000${n}`, publisher: 'Dark Horse', work: { id: `wd:Q400000${n}`, title: '' } }));
    const each = library({
      follows: [follow('following', blacksad.id, lineB[3].isbn, '4')],
      copies: [...owns(1), copyOf(lineB[4].isbn, [lineB[4].work.id])],
    });
    // The Catalog's Editions of the Copies tell which line the reader collected before 4.
    const editions = new Map([[isbns[0], volume(1)]]);

    const items = toBuyList(each, new Map([[isbns[0], line], [lineB[3].isbn, lineB]]), editions, 'en').missing;

    expect(items.map(({ isbn }) => isbn)).toEqual([isbns[1], isbns[2], lineB[3].isbn]);
  });

  test('a Volume is owned with any printing of it, or with a Copy of its Work in another Edition', () => {
    const reprint = volume(2, { isbn: '9791099999061' });
    const otherLine = copyOf('9782505000000', [volume(3).work.id]);

    const numbers = (copies: Saved<Copy>[]) => missingVolumes([...line, reprint], library({ copies })).map(({ volume: n }) => n);

    expect(numbers([...owns(1, 4), copyOf(reprint.isbn, [])])).toEqual([3]);
    expect(numbers([...owns(1, 4), otherLine])).toEqual([2]);
  });

  test('two printings of a missing Volume give one item', () => {
    const reprint = volume(2, { isbn: '9791099999061' });

    expect(missingVolumes([...line, reprint], library({ copies: owns(1, 3) })).map(({ volume: n }) => n)).toEqual([2]);
  });

  test('Series in alphabetical order of their title, Volumes in number order', () => {
    const astra = { id: 'wd:Q1000002', title: 'Ástra', sameAs: [] };
    const astraLine = [1, 2, 3].map((n) =>
      volume(n, { isbn: ['9782505000017', '9782505000024', '9782505000031'][n - 1], series: astra, title: 'Ástra', work: { id: `wd:Q300000${n}`, title: '' } }),
    );
    const each = library({
      follows: [follow('following'), follow('following', astra.id, astraLine[0].isbn)],
      copies: [...owns(1, 4), copyOf(astraLine[2].isbn, [astraLine[2].work.id])],
    });

    const items = toBuyList(each, new Map([...lines, [astraLine[0].isbn, astraLine]]), new Map(), 'fr').missing;

    expect(items.map(({ series, volume: n }) => `${series} ${n}`)).toEqual(['Ástra 1', 'Ástra 2', 'Blacksad 2', 'Blacksad 3']);
    // The screen shows one group per Series, in that order.
    expect(bySeries(items).map(({ title, items: volumes }) => `${title}: ${volumes.map(({ volume: n }) => n).join(',')}`)).toEqual([
      'Ástra: 1,2',
      'Blacksad: 2,3',
    ]);
  });

  test('books of no Series form one group of their own', () => {
    const items = toBuyList(library({ toBuy: [toBuy('9782266320481')] }), lines, new Map(), 'en').byHand;

    expect(bySeries(items)).toEqual([{ id: null, title: null, items }]);
  });
});

describe('Editions added to To Buy by hand', () => {
  const dune = '9782266320481';

  test('an Edition the Catalog does not know shows its ISBN, latest added first', () => {
    const items = toBuyList(library({ toBuy: [toBuy(dune, '2026-11-01T00:00:00.000Z'), toBuy(isbns[4])] }), lines, new Map(), 'en').byHand;

    expect(items.map(({ isbn }) => isbn)).toEqual([isbns[4], dune]);
    expect(items[1]).toMatchObject({ title: `ISBN ${dune}`, work: `isbn:${dune}`, byHand: true, edition: '' });
  });

  test('a hand-added Edition stays until bought: a Copy of the Edition or of its Work', () => {
    const editions = new Map([[isbns[4], volume(5)]]);
    const listed = library({ toBuy: [toBuy(isbns[4])] });

    expect(toBuyList(listed, lines, editions, 'en').byHand).toHaveLength(1);
    expect(toBuyList({ ...listed, copies: owns(5) }, lines, editions, 'en').byHand).toEqual([]);
    expect(toBuyList({ ...listed, copies: [copyOf('9782505000000', [volume(5).work.id])] }, lines, editions, 'en').byHand).toEqual([]);
  });

  test('a hand-added Edition that is also a Missing Volume is listed once, and buying it removes its record', () => {
    const list = toBuyList(library({ follows: [follow('following')], copies: owns(1, 3), toBuy: [toBuy(isbns[1])] }), lines, new Map(), 'en');

    expect(list.byHand).toEqual([]);
    expect(list.missing.map(({ isbn, byHand }) => [isbn, byHand])).toEqual([[isbns[1], true]]);
    expect(bought(list.missing[0], now).remove).toBe(isbns[1]);
  });

  test('adding by hand reads the ISBN as typed, and refuses one owned or already listed', () => {
    const each = library({ copies: owns(1), toBuy: [toBuy(isbns[1])] });

    expect(handAdd(' 979-10-99999-03-0 ', each, new Map(), now)).toEqual({ toBuy: { isbn: isbns[2], createdAt: now.toISOString() } });
    expect(handAdd(isbns[0], each, new Map(), now)).toEqual({ problem: 'owned' });
    expect(handAdd(isbns[1], each, new Map(), now)).toEqual({ problem: 'listed' });
    expect(handAdd('9791099999017', each, new Map(), now)).toEqual({ problem: 'check-digit' });
  });

  test('"I bought it" saves the Copy and deletes the record; removing deletes the record only', async () => {
    const { space, stored } = memorySpace();
    await saveToBuy(space, { isbn: isbns[4], createdAt: '2026-11-07T10:00:00.000Z' });
    await saveToBuy(space, { isbn: '9782266320481', createdAt: '2026-11-07T10:00:00.000Z' });
    const editions = new Map([[isbns[4], volume(5)]]);

    const [item] = toBuyList((await loadLibrary(space)).library, lines, editions, 'en').byHand.filter(({ isbn }) => isbn === isbns[4]);
    const { copy, remove } = bought(item, now);
    await saveCopy(space, copy);
    await deleteToBuy(space, remove!);
    await deleteToBuy(space, '9782266320481');

    expect(stored(copyCollection).map(({ value }) => value)).toEqual([{ $type: copyCollection, isbn: isbns[4], works: ['wd:Q2000005'], createdAt: now.toISOString() }]);
    expect(stored(toBuyCollection)).toEqual([]);
    expect(toBuyList((await loadLibrary(space)).library, lines, editions, 'en').byHand).toEqual([]);
  });
});
