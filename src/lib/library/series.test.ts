import { describe, expect, test } from 'vitest';
import type { Edition } from '../catalog/catalog';
import type { Copy } from './copy';
import { followCollection, saveFollow, type Follow } from './follow';
import { memorySpace } from './memory-space.fake';
import type { Library } from './model';
import type { ReadingStatus } from './reading-status';
import { lexicons, type Saved } from './records';
import { askCollected, collectedVolumes, dropSeries, followSeries, missingVolumes, seriesStanding, suggestsDrop, switchLine } from './series';

const blacksad = { id: 'wd:Q1000001', title: 'Blacksad' };

// An ISBN-13 from its first 12 digits: the check digit makes the EAN-13 sum a multiple of 10.
const isbn = (twelve: string) => {
  const sum = [...twelve].reduce((total, digit, i) => total + Number(digit) * (i % 2 === 0 ? 1 : 3), 0);
  return `${twelve}${(10 - (sum % 10)) % 10}`;
};

// Volume n of an Edition Line: line A (Dargaud) or line B (Dark Horse, English).
const volume = (n: number, line: 'A' | 'B' = 'A', change: Partial<Edition> = {}): Edition => ({
  isbn: isbn(`${line === 'A' ? '979109999' : '978150670'}${String(n).padStart(3, '0')}`),
  title: 'Blacksad',
  volumeTitle: null,
  authors: ['Juan Díaz Canales'],
  publisher: line === 'A' ? 'Dargaud' : 'Dark Horse',
  language: line === 'A' ? 'fre' : 'eng',
  format: null,
  cover: null,
  work: { id: `wd:Q${line === 'A' ? 2 : 3}00000${n}`, title: `Blacksad ${n}` },
  series: blacksad,
  volume: n,
  sources: ['BnF'],
  fetchedAt: '2026-11-06T10:00:00.000Z',
  ...change,
});
const lineA = [1, 2, 3, 4, 5, 6].map((n) => volume(n, 'A'));
const lineB = [1, 2, 3, 4, 5, 6].map((n) => volume(n, 'B'));
// `/volumes` answers with the whole Edition Line for any ISBN in it.
const byIsbn = (...each: Edition[][]) => new Map(each.flatMap((line) => line.map(({ isbn: one }) => [one, line] as const)));
const lines = byIsbn(lineA, lineB);
const editions = new Map([...lineA, ...lineB].map((each) => [each.isbn, each]));
const now = new Date('2026-11-10T12:00:00.000Z');

const copy = (edition: Edition): Saved<Copy> => ({
  rkey: `copy-${edition.isbn}`,
  value: { isbn: edition.isbn, works: [edition.work.id], createdAt: '2026-11-06T11:00:00.000Z' },
});
const owns = (line: Edition[], ...numbers: number[]) => numbers.map((n) => copy(line[n - 1]));
const status = (edition: Edition, chosen: ReadingStatus['status']): Saved<ReadingStatus> => ({
  rkey: edition.work.id,
  value: { work: edition.work.id, isbn: edition.isbn, status: chosen, updatedAt: '2026-11-07T10:00:00.000Z' },
});
const follow = (change: Partial<Follow> = {}): Follow => ({
  series: blacksad.id,
  anchorIsbn: lineA[0].isbn,
  status: 'following',
  updatedAt: '2026-11-06T11:00:00.000Z',
  ...change,
});
const library = (change: Partial<Library> = {}): Library => ({ copies: [], readingStatuses: [], follows: [], loans: [], toBuy: [], ...change });

describe('Where the reader stands in a Series', () => {
  test('counts Volumes owned, read and missing, and the next Volume after the latest one owned', () => {
    const each = library({
      copies: owns(lineA, 1, 2, 4),
      readingStatuses: [status(lineA[0], 'read'), status(lineA[2], 'read'), status(lineA[3], 'reading')],
    });

    const standing = seriesStanding(lineA, each);

    expect(standing.owned).toBe(3);
    // Volume 3 is read but not owned (borrowed): it counts as read, and it is still missing.
    expect(standing.read).toBe(2);
    expect(standing.missing.map(({ volume: n }) => n)).toEqual([3]);
    expect(standing.next).toBe(5);
  });

  test('spines: filled when read, outlined when owned and not read, dashed grey when not owned, before or after the latest one owned', () => {
    const each = library({ copies: owns(lineA, 1, 2, 4), readingStatuses: [status(lineA[0], 'read'), status(lineA[2], 'read')] });

    expect(seriesStanding(lineA, each).spines.map(({ volume: n, state }) => `${n} ${state}`)).toEqual([
      '1 read',
      '2 owned',
      '3 read',
      '4 owned',
      '5 not-owned',
      '6 not-owned',
    ]);
  });

  test('no Volume owned: nothing is missing, and the next one is the first', () => {
    const standing = seriesStanding(lineA, library());

    expect(standing).toMatchObject({ owned: 0, read: 0, missing: [], next: 1 });
  });

  test('every Volume owned: no next Volume', () => {
    expect(seriesStanding(lineA, library({ copies: owns(lineA, 1, 2, 3, 4, 5, 6) })).next).toBeNull();
  });

  test('two printings of a Volume make one spine; a Volume with no number makes none', () => {
    const reprint = volume(2, 'A', { isbn: isbn('979109999099') });
    const special = volume(0, 'A', { isbn: isbn('979109999098'), volume: null });

    const standing = seriesStanding([...lineA, reprint, special], library({ copies: [copy(reprint)] }));

    expect(standing.spines.map(({ volume: n }) => n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(standing.spines[1].state).toBe('owned');
  });

  test('a Missing Volume is one before the latest owned, owned by no printing of it', () => {
    const reprint = volume(2, 'A', { isbn: isbn('979109999099') });

    expect(missingVolumes([...lineA, reprint], library({ copies: [...owns(lineA, 1, 4), copy(reprint)] })).map(({ volume: n }) => n)).toEqual([3]);
  });
});

describe('The Volumes the reader collects after switching Edition Line', () => {
  const switched = follow({ anchorIsbn: lineB[0].isbn, fromVolume: '4' });

  test('never switched: the followed Edition Line', () => {
    expect(collectedVolumes(follow(), library(), lines, editions)).toBe(lineA);
  });

  test('from Volume N in line B: line A before N, line B from N on', () => {
    const each = library({ copies: owns(lineA, 1, 2) });

    expect(collectedVolumes(switched, each, lines, editions)?.map(({ isbn }) => isbn)).toEqual([
      lineA[0].isbn,
      lineA[1].isbn,
      lineA[2].isbn,
      lineB[3].isbn,
      lineB[4].isbn,
      lineB[5].isbn,
    ]);
  });

  test('line A is the one of the Copy of the highest Volume before N', () => {
    const lineC = [1, 2, 3].map((n) => volume(n, 'A', { isbn: isbn(`979100000${n}00`), publisher: 'Other' }));
    const each = library({ copies: [...owns(lineC, 1), ...owns(lineA, 2)] });

    const collected = collectedVolumes(switched, each, new Map([...lines, ...byIsbn(lineC)]), new Map([...editions, ...lineC.map((each) => [each.isbn, each] as const)]));

    expect(collected?.[0].isbn).toBe(lineA[0].isbn);
  });

  test('no Copy before N: line B for every Volume', () => {
    expect(collectedVolumes(switched, library(), lines, editions)).toBe(lineB);
  });

  test('line A not asked yet (offline): only line B from N on, so no Edition of the wrong line is suggested', () => {
    const each = library({ copies: owns(lineA, 1, 2) });

    expect(collectedVolumes(switched, each, byIsbn(lineB), editions)?.map(({ volume: n }) => n)).toEqual([4, 5, 6]);
  });

  test('a followed Edition Line the Catalog could not give: undefined', () => {
    expect(collectedVolumes(follow(), library(), new Map(), editions)).toBeUndefined();
  });

  test('a fromVolume that is not a number counts as no switch', () => {
    expect(collectedVolumes(follow({ fromVolume: 'IV' }), library({ copies: owns(lineB, 1) }), lines, editions)).toBe(lineA);
  });

  test('the Catalog is asked for the followed line, and after a switch for the Copies and line A, once', async () => {
    const asked: string[] = [];
    const ask = {
      volumes: (isbn: string) => {
        asked.push(`volumes ${isbn}`);
        return Promise.resolve([...lines.values()].find((each) => each.some((v) => v.isbn === isbn)));
      },
      editions: (isbns: string[]) => {
        asked.push(`editions ${isbns.length}`);
        return Promise.resolve(new Map([...editions].filter(([each]) => isbns.includes(each))));
      },
    };
    const each = library({ copies: owns(lineA, 1, 2) });
    const known = { lines: new Map<string, Edition[]>(), editions: new Map<string, Edition>() };

    await askCollected([follow()], each, known.lines, known.editions, ask);
    expect(asked).toEqual([`volumes ${lineA[0].isbn}`]);

    await askCollected([switched], each, known.lines, known.editions, ask);
    await askCollected([switched], each, known.lines, known.editions, ask);
    // Line A is asked through the reader's Copy of Volume 2, the highest one before 4.
    expect(asked).toEqual([`volumes ${lineA[0].isbn}`, `volumes ${lineB[0].isbn}`, 'editions 2', `volumes ${lineA[1].isbn}`]);
    expect(collectedVolumes(switched, each, known.lines, known.editions)?.map(({ volume: n }) => n)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('Missing Volumes after a switch come from line A before N and from line B from N on', () => {
    const each = library({ copies: [...owns(lineA, 1, 2), ...owns(lineB, 6)] });

    const missing = missingVolumes(collectedVolumes(switched, each, lines, editions)!, each);

    expect(missing.map(({ isbn }) => isbn)).toEqual([lineA[2].isbn, lineB[3].isbn, lineB[4].isbn]);
  });
});

describe('Follow, switch Edition Line, drop', () => {
  test('following a Series saves one record in the Edition Line of the Volume', async () => {
    const { space, stored } = memorySpace();

    await saveFollow(space, followSeries(lineA[2], undefined, now)!);

    expect(stored(followCollection).map(({ rkey, value }) => [rkey, value])).toEqual([
      [blacksad.id, { $type: followCollection, series: blacksad.id, anchorIsbn: lineA[2].isbn, status: 'following', updatedAt: now.toISOString() }],
    ]);
  });

  test('following a dropped Series again keeps its Edition Line and its switch', () => {
    const dropped = follow({ anchorIsbn: lineB[0].isbn, fromVolume: '4', status: 'dropped' });

    expect(followSeries(lineA[0], dropped, now)).toEqual({ ...dropped, status: 'following', updatedAt: now.toISOString() });
  });

  test('an Edition of no Series cannot be followed', () => {
    expect(followSeries(volume(1, 'A', { series: null }), undefined, now)).toBeUndefined();
  });

  test('dropping keeps the Edition Line, so following again needs no new choice', () => {
    expect(dropSeries(follow(), now)).toEqual({ ...follow(), status: 'dropped', updatedAt: now.toISOString() });
  });

  test('switching from Volume N: the anchor is that Edition, fromVolume is N, and the record matches its lexicon', () => {
    const result = switchLine(follow(), lineB[3], lineA, now);

    expect(result).toEqual({ follow: { ...follow(), anchorIsbn: lineB[3].isbn, fromVolume: '4', updatedAt: now.toISOString() } });
    expect(() => lexicons.assertValidRecord(followCollection, { $type: followCollection, ...('follow' in result ? result.follow : {}) })).not.toThrow();
  });

  test('switching from Volume 1 collects the new line from the start: no fromVolume', () => {
    expect(switchLine(follow({ fromVolume: '4' }), lineB[0], lineA, now)).toEqual({
      follow: { series: blacksad.id, anchorIsbn: lineB[0].isbn, status: 'following', updatedAt: now.toISOString() },
    });
  });

  test('switching refuses an unknown Edition, another Series, the same line and an Edition with no Volume number', () => {
    expect(switchLine(follow(), undefined, lineA, now)).toEqual({ problem: 'unknown' });
    expect(switchLine(follow(), volume(4, 'B', { series: { id: 'wd:Q9', title: 'Other' } }), lineA, now)).toEqual({ problem: 'other-series' });
    expect(switchLine(follow(), lineA[3], lineA, now)).toEqual({ problem: 'same-line' });
    expect(switchLine(follow(), volume(4, 'B', { volume: null }), lineA, now)).toEqual({ problem: 'no-volume' });
  });

  test('abandoning a Volume of a Followed Series suggests dropping it; nothing else does', () => {
    const followed = library({ follows: [{ rkey: blacksad.id, value: follow() }] });
    const dropped = library({ follows: [{ rkey: blacksad.id, value: follow({ status: 'dropped' }) }] });

    expect(suggestsDrop(lineA[2], 'abandoned', followed)).toBe(true);
    expect(suggestsDrop(lineA[2], 'read', followed)).toBe(false);
    expect(suggestsDrop(lineA[2], 'abandoned', dropped)).toBe(false);
    expect(suggestsDrop(lineA[2], 'abandoned', library())).toBe(false);
    expect(suggestsDrop(undefined, 'abandoned', followed)).toBe(false);
  });
});
