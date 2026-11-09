import { describe, expect, test } from 'vitest';
import type { Edition } from '../catalog/catalog';
import { copyCollection, type Copy } from './copy';
import { followCollection, type Follow } from './follow';
import type { Library } from './model';
import { followOnRead, noOnboarding, onboardingSave, seriesOnboarding, seriesRecords, step, typedVolume, volumeTiles, type Choices } from './onboarding';
import { readingStatusCollection, type ReadingStatus } from './reading-status';
import { lexicons, type Saved } from './records';

const series = { id: 'wd:Q1000001', title: 'Blacksad' };
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
  series,
  volume: n,
  sources: ['BnF'],
  fetchedAt: '2026-11-06T10:00:00.000Z',
  ...change,
});
const volumes = [1, 2, 3, 4, 5].map((n) => volume(n));
const now = new Date('2026-11-06T12:00:00.000Z');

const copyOf = (n: number, rkey = `copy${n}`): Saved<Copy> => ({
  rkey,
  value: { isbn: isbns[n - 1], works: [volume(n).work.id], createdAt: '2026-11-06T11:00:00.000Z' },
});
const readOf = (n: number, status: ReadingStatus['status'] = 'read'): Saved<ReadingStatus> => ({
  rkey: volume(n).work.id,
  value: { work: volume(n).work.id, isbn: isbns[n - 1], status, updatedAt: '2026-11-06T11:00:00.000Z' },
});
const followOf = (status: Follow['status']): Saved<Follow> => ({
  rkey: series.id,
  value: { series: series.id, anchorIsbn: isbns[0], status, updatedAt: '2026-11-06T11:00:00.000Z' },
});
const library = (change: Partial<Library> = {}): Library => ({ copies: [], readingStatuses: [], follows: [], loans: [], ...change });

describe('When Series Onboarding starts', () => {
  test('the first Volume of a Series enters the Library: the flow starts', () => {
    expect(noOnboarding(volume(1), volumes, library())).toBeUndefined();
  });

  test.each<[string, Partial<Library>, string]>([
    ['another Volume has a Copy', { copies: [copyOf(3)] }, 'in-library'],
    ['another Volume has a Reading Status (borrowed)', { readingStatuses: [readOf(2)] }, 'in-library'],
    ['the same Volume has a Copy already (a second Copy)', { copies: [copyOf(1)] }, 'in-library'],
    ['the Series is followed', { follows: [followOf('following')] }, 'followed'],
    ['the Series was dropped', { follows: [followOf('dropped')] }, 'dropped'],
  ])('no flow when %s, and Quick Add can say why', (_, before, why) => {
    expect(noOnboarding(volume(1), volumes, library(before))).toBe(why);
  });

  test('a Copy that only shares the ISBN of a Volume counts too (a Work the Catalog identified later)', () => {
    const typed: Saved<Copy> = { rkey: 'a', value: { isbn: isbns[2], works: [`isbn:${isbns[2]}`], createdAt: '2026-11-01T00:00:00.000Z' } };

    expect(noOnboarding(volume(1), volumes, library({ copies: [typed] }))).toBe('in-library');
  });

  test.each<[string, Partial<Edition>]>([
    ['no Series', { series: null }],
    ['no Volume number', { volume: null }],
  ])('an Edition with %s: no flow, nothing to say', (_, change) => {
    expect(noOnboarding(volume(1, change), [volume(1, change)], library())).toBe('no-series');
  });
});

describe('The records of one Series', () => {
  test('Copies and Reading Statuses of its Volumes, and its follow; nothing of another Series', () => {
    const other: Saved<Copy> = { rkey: 'other', value: { isbn: '9782723478991', works: ['wd:Q190192'], createdAt: '2026-11-01T00:00:00.000Z' } };
    const all = library({ copies: [copyOf(1), copyOf(4), other], readingStatuses: [readOf(2)], follows: [followOf('following')] });

    const found = seriesRecords(series.id, volumes, all);

    expect(found.copies.map(({ rkey }) => rkey)).toEqual(['copy1', 'copy4']);
    expect(found.readingStatuses.map(({ rkey }) => rkey)).toEqual([volume(2).work.id]);
    expect(found.follow?.rkey).toBe(series.id);
  });
});

describe('Series Onboarding choices', () => {
  // Quick Add just saved Volume 1, read.
  const afterQuickAdd = library({ copies: [copyOf(1)], readingStatuses: [readOf(1)] });
  const onboarding = seriesOnboarding(volume(1), volumes, afterQuickAdd);
  const choose = (change: Partial<Choices>): Choices => ({ ...onboarding.start, ...change });

  test('it starts from the Library: owned up to the added Volume, read as said in Quick Add, follow on', () => {
    expect(onboarding.start).toEqual({ ownedUpTo: 1, readUpTo: 1, tapped: new Set(), follow: true });
    expect(onboarding.steps).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test('two printings of one Volume give one tile: the one the reader added or owns', () => {
    const reprint = volume(1, { isbn: '9791099999061' });
    const added = seriesOnboarding(reprint, [volume(1), reprint, volume(2)], library());
    expect(added.volumes.map(({ isbn }) => isbn)).toEqual(['9791099999061', isbns[1]]);

    const owned = library({ copies: [copyOf(2), { rkey: 'r', value: { isbn: '9791099999061', works: [volume(1).work.id], createdAt: '2026-11-01T00:00:00.000Z' } }] });
    expect(seriesOnboarding(volume(2), [volume(1), reprint, volume(2)], owned).volumes.map(({ isbn }) => isbn)).toEqual([
      '9791099999061',
      isbns[1],
    ]);
    expect(seriesOnboarding(volume(2), [volume(1), reprint, volume(2)], library()).volumes.map(({ isbn }) => isbn)).toEqual([
      isbns[0],
      isbns[1],
    ]);
  });

  test('only numbered Volumes take part; the steppers move through the known numbers', () => {
    const known = [volume(1), volume(2), volume(5, { volume: 5.5 }), volume(4, { volume: null })];
    const some = seriesOnboarding(volume(1), known, afterQuickAdd);

    expect(some.volumes.map((each) => each.volume)).toEqual([1, 2, 5.5]);
    expect(some.steps).toEqual([0, 1, 2, 5.5]);
    expect(step(some.steps, 2, 1)).toBe(5.5);
    expect(step(some.steps, 5.5, 1)).toBe(5.5);
    expect(step(some.steps, 0, -1)).toBe(0);
  });

  test('a long Series: the reader types the last Volume instead of pressing + 113 times', () => {
    const steps = [0, 1, 2, 5.5];

    expect(typedVolume(steps, '2')).toBe(2);
    // A Volume the Catalog does not know still bounds the range (One Piece 13).
    expect(typedVolume(steps, '4')).toBe(4);
    expect(typedVolume(steps, '250')).toBe(5.5);
    expect(typedVolume(steps, '-3')).toBe(0);
    expect(typedVolume(steps, '')).toBeUndefined();
    expect(typedVolume(steps, 'abc')).toBeUndefined();
    // − and + from a typed value go to the next known Volume.
    expect(step(steps, 4, 1)).toBe(5.5);
    expect(step(steps, 4, -1)).toBe(2);
  });

  test('a typed range gives the Volumes up to it', () => {
    const tiles = volumeTiles(onboarding, afterQuickAdd, choose({ ownedUpTo: 3.5 }));

    expect(tiles.filter(({ owned }) => owned).map(({ volume }) => volume)).toEqual([1, 2, 3]);
  });

  test('"I own 1 to 5", "read up to 3", Volume 4 tapped as a gap: Copies, Reading Statuses and the follow', () => {
    const choices = choose({ ownedUpTo: 5, readUpTo: 3, tapped: new Set([isbns[3]]) });

    expect(volumeTiles(onboarding, afterQuickAdd, choices).map(({ volume, owned, read }) => [volume, owned, read])).toEqual([
      [1, true, true],
      [2, true, true],
      [3, true, true],
      [4, false, false],
      [5, true, false],
    ]);

    const saved = onboardingSave(onboarding, afterQuickAdd, choices, now);
    // Volume 1 already has its Copy and its Reading Status: nothing again.
    expect(saved.copies.map((copy) => [copy.isbn, copy.works])).toEqual([
      [isbns[1], [volume(2).work.id]],
      [isbns[2], [volume(3).work.id]],
      [isbns[4], [volume(5).work.id]],
    ]);
    expect(saved.readingStatuses.map(({ work, isbn, status }) => [work, isbn, status])).toEqual([
      [volume(2).work.id, isbns[1], 'read'],
      [volume(3).work.id, isbns[2], 'read'],
    ]);
    expect(saved.follow).toEqual({ series: series.id, anchorIsbn: isbns[0], status: 'following', updatedAt: now.toISOString() });

    // Each record is valid for its lexicon.
    const valid = (collection: string, value: object | undefined) =>
      expect(() => lexicons.assertValidRecord(collection, { $type: collection, ...value })).not.toThrow();
    for (const copy of saved.copies) valid(copyCollection, copy);
    for (const status of saved.readingStatuses) valid(readingStatusCollection, status);
    valid(followCollection, saved.follow);
  });

  test('tapping a Volume out of the range adds it: a lone Volume owned', () => {
    const tiles = volumeTiles(onboarding, afterQuickAdd, choose({ tapped: new Set([isbns[3]]) }));

    expect(tiles.filter(({ owned }) => owned).map(({ volume }) => volume)).toEqual([1, 4]);
  });

  test('read beyond what is owned gives Reading Statuses with no Copy (borrowed)', () => {
    const saved = onboardingSave(onboarding, afterQuickAdd, choose({ readUpTo: 3 }), now);

    expect(saved.copies).toEqual([]);
    expect(saved.readingStatuses.map(({ isbn }) => isbn)).toEqual([isbns[1], isbns[2]]);
  });

  test('onboarding never takes anything away: a Volume with a Copy stays owned, a read Volume stays read', () => {
    const before = library({ copies: [copyOf(1), copyOf(3)], readingStatuses: [readOf(3)] });
    const some = seriesOnboarding(volume(1), volumes, before);
    const choices = { ...some.start, ownedUpTo: 0, readUpTo: 0, tapped: new Set([isbns[0], isbns[2]]) };

    const tiles = volumeTiles(some, before, choices);
    expect(tiles.filter(({ owned }) => owned).map(({ volume }) => volume)).toEqual([1, 3]);
    expect(tiles.filter(({ read }) => read).map(({ volume }) => volume)).toEqual([3]);
    expect(tiles.filter(({ kept }) => kept).map(({ volume }) => volume)).toEqual([1, 3]);
    expect(onboardingSave(some, before, choices, now)).toMatchObject({ copies: [], readingStatuses: [] });
  });

  test('a Volume being read becomes read when it is in the read range', () => {
    const before = library({ copies: [copyOf(1)], readingStatuses: [readOf(2, 'reading')] });
    const some = seriesOnboarding(volume(1), volumes, before);

    expect(some.start.readUpTo).toBe(0);
    expect(onboardingSave(some, before, { ...some.start, readUpTo: 2 }, now).readingStatuses.map(({ isbn }) => isbn)).toEqual([
      isbns[0],
      isbns[1],
    ]);
  });

  test('the same choices as the start add no Copy and no Reading Status', () => {
    expect(onboardingSave(onboarding, afterQuickAdd, onboarding.start, now)).toMatchObject({ copies: [], readingStatuses: [] });
  });

  test('"Tell me when a new Volume is out" off: the Series is Dropped, so reading a Volume later does not follow it', () => {
    const saved = onboardingSave(onboarding, afterQuickAdd, choose({ follow: false }), now);

    expect(saved.follow?.status).toBe('dropped');
  });

  test('the follow record is not written again when it already says the same', () => {
    const followed = library({ ...afterQuickAdd, follows: [followOf('following')] });

    expect(onboardingSave(onboarding, followed, onboarding.start, now).follow).toBeUndefined();
    expect(onboardingSave(onboarding, followed, choose({ follow: false }), now).follow?.status).toBe('dropped');
  });
});

describe('A Series becomes followed when a Volume is marked read', () => {
  test('marking a Volume read follows its Series, in the Edition Line of that Volume', () => {
    expect(followOnRead(volume(3), 'read', library(), now)).toEqual({
      series: series.id,
      anchorIsbn: isbns[2],
      status: 'following',
      updatedAt: now.toISOString(),
    });
  });

  test.each<[string, Edition | undefined, ReadingStatus['status'], Partial<Library>]>([
    ['another status', volume(3), 'reading', {}],
    ['a Series already followed', volume(3), 'read', { follows: [followOf('following')] }],
    ['a Dropped Series: dropping is deliberate', volume(3), 'read', { follows: [followOf('dropped')] }],
    ['a Work with no Series', volume(3, { series: null }), 'read', {}],
    ['a book the Catalog does not know', undefined, 'read', {}],
  ])('no follow for %s', (_, edition, status, change) => {
    expect(followOnRead(edition, status, library(change), now)).toBeUndefined();
  });
});
