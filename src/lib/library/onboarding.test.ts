import { describe, expect, test } from 'vitest';
import type { Edition } from '../catalog/catalog';
import { copyCollection, type Copy } from './copy';
import { followCollection, type Follow } from './follow';
import type { Library } from './model';
import {
  answer,
  followOnRead,
  noOnboarding,
  onboardingSave,
  sameAsOwned,
  seriesOnboarding,
  seriesRecords,
  step,
  tapTile,
  typedVolume,
  volumeTiles,
  withRange,
  type Choices,
  type TapMode,
} from './onboarding';
import { readingStatusCollection, type ReadingStatus } from './reading-status';
import { lexicons, type Saved } from './records';

const series = { id: 'wd:Q1000001', title: 'Blacksad', sameAs: [] };
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
  volumes: [n],
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
const library = (change: Partial<Library> = {}): Library => ({ copies: [], readingStatuses: [], follows: [], loans: [], toBuy: [], ...change });

describe('When Series Onboarding starts', () => {
  test('the first Volume of a Series enters the Library: the flow starts', () => {
    expect(noOnboarding(volume(1), library())).toBeUndefined();
  });

  test.each<[string, Partial<Library>]>([
    ['another Volume has a Copy', { copies: [copyOf(3)] }],
    ['another Volume has a Reading Status (borrowed)', { readingStatuses: [readOf(2)] }],
    ['the same Volume has a Copy already (a second Copy)', { copies: [copyOf(1)] }],
  ])('the flow starts when %s but the Series has no follow: those Volumes show as kept', (_, before) => {
    expect(noOnboarding(volume(1), library(before))).toBeUndefined();
  });

  test.each<[string, Follow['status'], string]>([
    ['followed', 'following', 'followed'],
    ['dropped', 'dropped', 'dropped'],
  ])('no flow when the Series is %s, and Quick Add can say why', (_, status, why) => {
    expect(noOnboarding(volume(1), library({ follows: [followOf(status)] }))).toBe(why);
  });

  test('followed from Check a book before any Volume was added: the flow starts', () => {
    expect(noOnboarding(volume(1), library({ follows: [followOf('following')] }), volumes)).toBeUndefined();
  });

  test.each<[string, Partial<Library>]>([
    ['a Copy', { copies: [copyOf(3)] }],
    ['a Reading Status', { readingStatuses: [readOf(2)] }],
  ])('followed, and another Volume of the Edition Line has %s: no flow', (_, before) => {
    expect(noOnboarding(volume(1), library({ follows: [followOf('following')], ...before }), volumes)).toBe('followed');
  });

  test('dropped with no Volume in the Library: still no flow, the reader said no', () => {
    expect(noOnboarding(volume(1), library({ follows: [followOf('dropped')] }), volumes)).toBe('dropped');
  });

  test.each<[string, Partial<Edition>]>([
    ['no Series', { series: null }],
    ['no Volume number', { volumes: [], volume: null }],
  ])('an Edition with %s: no flow, nothing to say', (_, change) => {
    expect(noOnboarding(volume(1, change), library())).toBe('no-series');
  });
});

describe('The records of one Series', () => {
  test('Copies and Reading Statuses of its Volumes, and its follow; nothing of another Series', () => {
    const other: Saved<Copy> = { rkey: 'other', value: { isbn: '9782723478991', works: ['wd:Q190192'], createdAt: '2026-11-01T00:00:00.000Z' } };
    const all = library({ copies: [copyOf(1), copyOf(4), other], readingStatuses: [readOf(2)], follows: [followOf('following')] });

    const found = seriesRecords(series, volumes, all);

    expect(found.copies.map(({ rkey }) => rkey)).toEqual(['copy1', 'copy4']);
    expect(found.readingStatuses.map(({ rkey }) => rkey)).toEqual([volume(2).work.id]);
    expect(found.follow?.rkey).toBe(series.id);
  });
});

describe('Series Onboarding from an omnibus', () => {
  // Quick Add just saved the omnibus of Volumes 1 and 2 ("Tomes 1-2").
  const omnibus = volume(1, { isbn: '9791099999078', volumes: [1, 2], work: { id: 'wd:Q2999999', title: 'Blacksad 1-2' } });
  const line = [omnibus, ...volumes];

  test('the omnibus gives the tiles of both its Volumes; a single printing gives the others', () => {
    const onboarding = seriesOnboarding(omnibus, line, library({ copies: [{ rkey: 'o', value: { isbn: omnibus.isbn, works: [omnibus.work.id], createdAt: now.toISOString() } }] }));

    expect(onboarding.volumes.map(({ volume: n, isbn }) => [n, isbn])).toEqual([
      [1, omnibus.isbn],
      [2, omnibus.isbn],
      [3, isbns[2]],
      [4, isbns[3]],
      [5, isbns[4]],
    ]);
    expect(onboarding.start.ownedUpTo).toBe(2);
  });

  test('saving "I own 1 to 3, read up to 2" writes one Copy and one Reading Status for the omnibus', () => {
    const onboarding = seriesOnboarding(omnibus, line, library());

    const saved = onboardingSave(onboarding, library(), { ...onboarding.start, ownedUpTo: 3, readUpTo: 2 }, now);

    expect(saved.copies.map(({ isbn }) => isbn)).toEqual([omnibus.isbn, isbns[2]]);
    expect(saved.readingStatuses.map(({ isbn }) => isbn)).toEqual([omnibus.isbn]);
  });

  test('a single Volume added: its other Volumes come from single printings, not the omnibus', () => {
    expect(seriesOnboarding(volume(3), line, library()).volumes.map(({ isbn }) => isbn)).toEqual(isbns);
  });
});

describe('Series Onboarding writes no day on its Copies', () => {
  test('the Volumes were got before: no Copy holds the day the reader got it', () => {
    const onboarding = seriesOnboarding(volume(1), volumes, library());
    const save = onboardingSave(onboarding, library(), { ...onboarding.start, ownedUpTo: 3 }, now);

    expect(save.copies).toHaveLength(3);
    expect(save.copies.map((copy) => copy.acquiredAt)).toEqual([undefined, undefined, undefined]);
  });
});

describe('Series Onboarding choices', () => {
  // Quick Add just saved Volume 1, read.
  const afterQuickAdd = library({ copies: [copyOf(1)], readingStatuses: [readOf(1)] });
  const onboarding = seriesOnboarding(volume(1), volumes, afterQuickAdd);
  const choose = (change: Partial<Choices>): Choices => ({ ...onboarding.start, ...change });

  test('it starts from the Library: owned up to the added Volume, read as said in Quick Add, follow on', () => {
    expect(onboarding.start).toEqual({ ownedUpTo: 1, readUpTo: 1, tapped: new Map(), readTapped: new Map(), follow: true });
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

  test('only numbered Volumes take part; the steppers move through every tile number', () => {
    const known = [volume(1), volume(2), volume(5, { volumes: [5.5], volume: 5.5 }), volume(4, { volumes: [], volume: null })];
    const some = seriesOnboarding(volume(1), known, afterQuickAdd);

    expect(some.volumes.map((each) => each.volume)).toEqual([1, 2, 5.5]);
    expect(some.steps).toEqual([0, 1, 2, 3, 4, 5, 5.5]);
    expect(step(some.steps, 2, 1)).toBe(3);
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
    const choices = choose({ ownedUpTo: 5, readUpTo: 3, tapped: new Map([[isbns[3], false]]) });

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
    const tiles = volumeTiles(onboarding, afterQuickAdd, choose({ tapped: new Map([[isbns[3], true]]) }));

    expect(tiles.filter(({ owned }) => owned).map(({ volume }) => volume)).toEqual([1, 4]);
  });

  test('read is capped at owned: a read range past the owned Volumes reads nothing more', () => {
    expect(onboardingSave(onboarding, afterQuickAdd, choose({ readUpTo: 3 }), now)).toMatchObject({ copies: [], readingStatuses: [] });
  });

  test('a tap in Read mode marks a Volume read, not owned (borrowed): a Reading Status with no Copy', () => {
    const saved = onboardingSave(onboarding, afterQuickAdd, tapTile(onboarding, afterQuickAdd, onboarding.start, 'read', isbns[2]), now);

    expect(saved.copies).toEqual([]);
    expect(saved.readingStatuses.map(({ isbn }) => isbn)).toEqual([isbns[2]]);
  });

  test('onboarding never takes anything away: a Volume with a Copy stays owned, a read Volume stays read', () => {
    const before = library({ copies: [copyOf(1), copyOf(3)], readingStatuses: [readOf(3)] });
    const some = seriesOnboarding(volume(1), volumes, before);
    const choices = { ...some.start, ownedUpTo: 0, readUpTo: 0, tapped: new Map([[isbns[0], false], [isbns[2], false]]) };

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
    expect(onboardingSave(some, before, { ...some.start, ownedUpTo: 2, readUpTo: 2 }, now).readingStatuses.map(({ isbn }) => isbn)).toEqual([
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

describe('Every Volume number from 1 to the highest known', () => {
  // The Catalog knows Volumes 1, 3 and 5 only (One Piece: 1, 105, 106, 112, 113).
  const known = [volume(1), volume(3), volume(5)];
  // Quick Add just saved Volume 1.
  const afterQuickAdd = library({ copies: [copyOf(1)] });
  const onboarding = seriesOnboarding(volume(1), known, afterQuickAdd);

  test('a tile for each number; a number with no Catalog Edition has no ISBN and cannot be owned or read', () => {
    const choices = { ...onboarding.start, ownedUpTo: 5, readUpTo: 5 };

    expect(volumeTiles(onboarding, afterQuickAdd, choices).map(({ volume, isbn, owned, read }) => [volume, isbn, owned, read])).toEqual([
      [1, isbns[0], true, true],
      [2, null, false, false],
      [3, isbns[2], true, true],
      [4, null, false, false],
      [5, isbns[4], true, true],
    ]);
    expect(onboarding.steps).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test('a Volume number of 1000 or more (a year read as a Volume) gets its own tile but fills no gap', () => {
    const odd = seriesOnboarding(volume(1), [volume(1), volume(3, { volumes: [2019], volume: 2019 })], afterQuickAdd);

    expect(odd.steps).toEqual([0, 1, 2019]);
  });

  test('Save writes records for known Volumes only: an unknown number has no ISBN (ADR 0010)', () => {
    const saved = onboardingSave(onboarding, afterQuickAdd, { ...onboarding.start, ownedUpTo: 5, readUpTo: 5 }, now);

    expect(saved.copies.map(({ isbn }) => isbn)).toEqual([isbns[2], isbns[4]]);
    expect(saved.readingStatuses.map(({ isbn }) => isbn)).toEqual([isbns[0], isbns[2], isbns[4]]);
  });

  test('when the reader scans Volume 2 into the Edition Line (CORE-108), the earlier choices stay and its tile can be owned and read', () => {
    // Owned up to 5, Volume 3 tapped not owned.
    const choices = tapTile(onboarding, afterQuickAdd, { ...onboarding.start, ownedUpTo: 5 }, 'owned', isbns[2]);

    const after = seriesOnboarding(volume(1), [...known, volume(2)], afterQuickAdd);

    expect(volumeTiles(after, afterQuickAdd, choices).map(({ volume, isbn, owned }) => [volume, isbn, owned])).toEqual([
      [1, isbns[0], true],
      [2, isbns[1], true],
      [3, isbns[2], false],
      [4, null, false],
      [5, isbns[4], true],
    ]);
    const read = tapTile(after, afterQuickAdd, choices, 'read', isbns[1]);
    expect(onboardingSave(after, afterQuickAdd, read, now).readingStatuses.map(({ isbn }) => isbn)).toEqual([isbns[1]]);
  });
});

describe('Tap changes Owned or Read', () => {
  // Quick Add just saved Volume 1, not read.
  const afterQuickAdd = library({ copies: [copyOf(1)] });
  const onboarding = seriesOnboarding(volume(1), volumes, afterQuickAdd);
  const tilesOf = (choices: Choices) => volumeTiles(onboarding, afterQuickAdd, choices);
  const readOnes = (choices: Choices) => tilesOf(choices).filter(({ read }) => read).map(({ volume }) => volume);
  const ownedOnes = (choices: Choices) => tilesOf(choices).filter(({ owned }) => owned).map(({ volume }) => volume);
  const tap = (choices: Choices, mode: TapMode, one: string) => tapTile(onboarding, afterQuickAdd, choices, mode, one);

  test('in Read mode a tap toggles read for that one tile, and owned does not change', () => {
    const once = tap(onboarding.start, 'read', isbns[2]);

    expect(readOnes(once)).toEqual([3]);
    expect(ownedOnes(once)).toEqual(ownedOnes(onboarding.start));
    expect(readOnes(tap(once, 'read', isbns[2]))).toEqual([]);
  });

  test('in Owned mode a tap toggles owned only', () => {
    const once = tap(onboarding.start, 'owned', isbns[3]);

    expect(ownedOnes(once)).toEqual([1, 4]);
    expect(readOnes(once)).toEqual([]);
  });

  test('read 1 and 3, not 2: Save writes Reading Statuses for 1 and 3 only', () => {
    const choices = tap(withRange(withRange(onboarding.start, 'owned', 3), 'read', 3), 'read', isbns[1]);

    expect(readOnes(choices)).toEqual([1, 3]);
    expect(onboardingSave(onboarding, afterQuickAdd, choices, now).readingStatuses.map(({ isbn }) => isbn)).toEqual([isbns[0], isbns[2]]);
  });

  test('the stepper keeps the gaps the reader tapped: Volume 3 off stays off when the range moves', () => {
    const gap = tap(withRange(onboarding.start, 'owned', 5), 'owned', isbns[2]);
    expect(ownedOnes(gap)).toEqual([1, 2, 4, 5]);

    expect(ownedOnes(withRange(gap, 'owned', 4))).toEqual([1, 2, 4]);
    expect(ownedOnes(withRange(withRange(gap, 'owned', 1), 'owned', 5))).toEqual([1, 2, 4, 5]);
  });

  test('a Volume tapped on past the range stays owned when the range moves', () => {
    const lone = tap(onboarding.start, 'owned', isbns[3]);

    expect(ownedOnes(withRange(lone, 'owned', 2))).toEqual([1, 2, 4]);
    expect(ownedOnes(withRange(lone, 'owned', 5))).toEqual([1, 2, 3, 4, 5]);
  });

  test('a second tap undoes the first: the tile follows the range again', () => {
    const twice = tap(tap(withRange(onboarding.start, 'owned', 5), 'owned', isbns[2]), 'owned', isbns[2]);

    expect(ownedOnes(withRange(twice, 'owned', 2))).toEqual([1, 2]);
  });

  test('"Same as owned" reads exactly the owned Volumes, gaps too', () => {
    const owned = tap(tap(withRange(onboarding.start, 'owned', 3), 'owned', isbns[1]), 'owned', isbns[4]);

    const same = sameAsOwned(onboarding, afterQuickAdd, tap(owned, 'read', isbns[3]));

    expect(readOnes(same)).toEqual([1, 3, 5]);
    expect(readOnes(same)).toEqual(ownedOnes(same));
  });

  test('a Volume read already stays read: onboarding never lowers a Reading Status', () => {
    const before = library({ copies: [copyOf(1)], readingStatuses: [readOf(2)] });
    const some = seriesOnboarding(volume(1), volumes, before);
    // Read range none, and a tap on Volume 2 that would make it not read.
    const choices = tapTile(some, before, withRange(some.start, 'read', 0), 'read', isbns[1]);

    const tile = volumeTiles(some, before, choices).find(({ volume }) => volume === 2)!;
    expect(tile).toMatchObject({ read: true, keptRead: true });
    expect(onboardingSave(some, before, choices, now).readingStatuses).toEqual([]);
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

describe('A follow saved under an older identifier of the Series (same_as, ADR 0010)', () => {
  // The Catalog now answers wd:Q1000001, same as the identifier it minted first.
  const minted = 'atomes:catalog.test:01M750SM80AX373XJ01DSVNDXC';
  const linkedVolumes = volumes.map((each) => ({ ...each, series: { ...series, sameAs: [minted] } }));
  const oldFollow = (status: Follow['status']): Saved<Follow> => ({
    rkey: minted,
    value: { series: minted, anchorIsbn: isbns[0], status, updatedAt: '2026-11-06T11:00:00.000Z' },
  });

  test('Quick Add sees the Series is followed or dropped', () => {
    expect(noOnboarding(linkedVolumes[0], library({ follows: [oldFollow('following')] }))).toBe('followed');
    expect(noOnboarding(linkedVolumes[0], library({ follows: [oldFollow('dropped')] }))).toBe('dropped');
  });

  test('reading a Volume writes no second follow', () => {
    expect(followOnRead(linkedVolumes[2], 'read', library({ follows: [oldFollow('dropped')] }), now)).toBeUndefined();
  });

  test('Save changes the follow under its old record key', () => {
    const before = library({ follows: [oldFollow('following')] });
    const onboarding = seriesOnboarding(linkedVolumes[0], linkedVolumes, before);

    const saved = onboardingSave(onboarding, before, { ...onboarding.start, follow: false }, now);

    expect(saved.follow).toEqual({ series: minted, anchorIsbn: isbns[0], status: 'dropped', updatedAt: now.toISOString() });
  });
});

describe('Series Onboarding from a later Volume', () => {
  // Quick Add just saved Volume 4: the reader has no other Volume of the Series.
  const afterQuickAdd = library({ copies: [copyOf(4)] });
  const onboarding = seriesOnboarding(volume(4), volumes, afterQuickAdd);
  const ownedOnes = (choices: Choices) =>
    volumeTiles(onboarding, afterQuickAdd, choices)
      .filter(({ owned }) => owned)
      .map(({ volume: n }) => n);

  test('only the scanned Volume is owned, and Save with no tap adds no Copy', () => {
    expect(ownedOnes(onboarding.start)).toEqual([4]);
    expect(onboarding.start.ownedUpTo).toBe(0);
    expect(onboardingSave(onboarding, afterQuickAdd, onboarding.start, now).copies).toEqual([]);
  });

  test('it asks first whether the reader owns the Volumes before it', () => {
    expect(onboarding.ask).toEqual({ upTo: 3 });
  });

  test('"Yes" ticks the Volumes before it, and Save adds their Copies', () => {
    const yes = answer(onboarding, onboarding.start, 'yes');

    expect(ownedOnes(yes)).toEqual([1, 2, 3, 4]);
    expect(onboardingSave(onboarding, afterQuickAdd, yes, now).copies.map(({ isbn }) => isbn)).toEqual(isbns.slice(0, 3));
  });

  test.each(['some', 'no'] as const)('"%s" ticks nothing more', (said) => {
    expect(ownedOnes(answer(onboarding, onboarding.start, said))).toEqual([4]);
  });

  test('One Piece 56 for a reader with no One Piece: Save adds nothing more; "Yes" then Save adds Volumes 1 to 55', () => {
    const onePiece = Array.from({ length: 56 }, (_, index) =>
      volume(1, { isbn: `97820000${String(index + 1).padStart(5, '0')}`, volumes: [index + 1], volume: index + 1, work: { id: `wd:Q30${index + 1}`, title: `One Piece ${index + 1}` } }),
    );
    const added: Saved<Copy> = { rkey: 'c56', value: { isbn: onePiece[55].isbn, works: [onePiece[55].work.id], createdAt: now.toISOString() } };
    const before = library({ copies: [added] });
    const long = seriesOnboarding(onePiece[55], onePiece, before);

    expect(long.ask).toEqual({ upTo: 55 });
    expect(onboardingSave(long, before, long.start, now).copies).toHaveLength(0);
    expect(onboardingSave(long, before, answer(long, long.start, 'yes'), now).copies).toHaveLength(55);
  });

  test('no question when the reader owns the Volumes before it, or when it is the first', () => {
    const owned = library({ copies: [copyOf(1), copyOf(2), copyOf(3), copyOf(4)] });
    expect(seriesOnboarding(volume(4), volumes, owned).ask).toBeUndefined();
    expect(seriesOnboarding(volume(1), volumes, library({ copies: [copyOf(1)] })).ask).toBeUndefined();
  });
});
