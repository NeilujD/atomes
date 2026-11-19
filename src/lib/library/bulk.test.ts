import { describe, expect, test } from 'vitest';
import type { Edition } from '../catalog/catalog';
import { addLabelBulk, type Bulk, moveCorrections, moveUndo, privacyChange, removeLabelBulk, statusBulk, writeAll } from './bulk';
import { labelCollection, type Label } from './label';
import { memorySpace } from './memory-space.fake';
import type { Library } from './model';
import { readingStatusCollection, type ReadingStatus } from './reading-status';
import type { Saved } from './records';

const at = '2026-11-15T10:00:00.000Z';
const now = new Date(at);
const empty: Library = { copies: [], readingStatuses: [], follows: [], loans: [], toBuy: [] };
// Five Volumes of One Piece, by their Works.
const picked = [1, 2, 3, 4, 5].map((volume) => ({ work: `wd:Q${volume}`, isbn: `978272343462${volume}` }));
const reading: ReadingStatus = { work: 'wd:Q2', isbn: '9782723434622', status: 'reading', updatedAt: '2026-11-01T00:00:00.000Z' };
const read: ReadingStatus = { work: 'wd:Q3', isbn: '9782723434623', status: 'read', finishedAt: '2026-11-02T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z' };
const library: Library = { ...empty, readingStatuses: [reading, read].map((value) => ({ rkey: value.work, value })) };

describe('Set a Reading Status on many Works', () => {
  test('writes the new status of each Work that changes, and leaves one already at it', () => {
    const { writes } = statusBulk(picked, 'read', library, now);

    expect(writes.map(({ rkey }) => rkey)).toEqual(['wd:Q1', 'wd:Q2', 'wd:Q4', 'wd:Q5']);
    expect(writes[1]).toEqual({ collection: readingStatusCollection, rkey: 'wd:Q2', value: { work: 'wd:Q2', isbn: '9782723434622', status: 'read', updatedAt: at } });
  });

  test('a bulk mark is not dated: it sets no day and keeps the days there are (ADR 0019)', () => {
    const started: ReadingStatus = { ...reading, startedAt: '2026-11-01T00:00:00.000Z' };
    const dated: Library = { ...empty, readingStatuses: [started, read].map((value) => ({ rkey: value.work, value })) };
    const days = (bulk: Bulk) => bulk.writes.map(({ value }) => value as ReadingStatus).map(({ work, startedAt, finishedAt }) => [work, startedAt, finishedAt]);

    expect(days(statusBulk(picked, 'read', dated, now))).toEqual([
      ['wd:Q1', undefined, undefined],
      ['wd:Q2', '2026-11-01T00:00:00.000Z', undefined],
      ['wd:Q4', undefined, undefined],
      ['wd:Q5', undefined, undefined],
    ]);
    expect(days(statusBulk(picked, 'unread', dated, now))).toEqual([
      ['wd:Q2', '2026-11-01T00:00:00.000Z', undefined],
      ['wd:Q3', undefined, '2026-11-02T00:00:00.000Z'],
    ]);
  });

  test('Undo puts back the Reading Status each Work had, and deletes the ones it did not have', async () => {
    const { space, stored } = memorySpace();
    for (const value of [reading, read]) await space.put(readingStatusCollection, value.work, { $type: readingStatusCollection, ...value });
    const { writes, undo } = statusBulk(picked, 'read', library, now);

    expect(await writeAll(space, writes)).toBe('sent');
    expect(stored(readingStatusCollection)).toHaveLength(5);

    await writeAll(space, undo);
    expect(stored(readingStatusCollection)).toEqual([
      { rkey: 'wd:Q2', value: { $type: readingStatusCollection, ...reading } },
      { rkey: 'wd:Q3', value: { $type: readingStatusCollection, ...read } },
    ]);
  });

  test('offline, every write says it waits on this device', async () => {
    const { space } = memorySpace('waiting');

    expect(await writeAll(space, statusBulk(picked, 'read', empty, now).writes)).toBe('waiting');
  });
});

describe('Add or remove a Label on many Works', () => {
  const works = ['wd:Q1', 'wd:Q2', 'wd:Q3'];
  const shonen: Saved<Label> = { rkey: '3lshonen', value: { name: 'Shōnen', works: ['wd:Q2', 'wd:Q9'], series: ['wd:Q673'], createdAt: '2026-11-01T00:00:00.000Z' } };
  const key = () => '3lnewlabel';

  test('a name the reader has no Label of makes one Label that the three Works carry; Undo deletes it', () => {
    const bulk = addLabelBulk('Seinen ', works, [shonen], now, 'en', key);

    expect(bulk).toEqual({
      writes: [{ collection: labelCollection, rkey: '3lnewlabel', value: { name: 'Seinen', works, createdAt: at } }],
      undo: [{ collection: labelCollection, rkey: '3lnewlabel', value: null }],
    });
  });

  test('the name of a Label the reader has adds the Works to it, each once; Undo puts the Label back as it was', () => {
    const bulk = addLabelBulk('shonen', works, [shonen], now, 'en', key);

    expect(bulk).toEqual({
      writes: [{ collection: labelCollection, rkey: '3lshonen', value: { ...shonen.value, works: ['wd:Q9', 'wd:Q1', 'wd:Q2', 'wd:Q3'] } }],
      undo: [{ collection: labelCollection, rkey: '3lshonen', value: shonen.value }],
    });
  });

  test('an empty name is a problem to show by the field', () => {
    expect(addLabelBulk('  ', works, [shonen], now, 'en', key)).toEqual({ problem: 'empty' });
  });

  test('removing a Label takes the Works off it and keeps its others and its Series; Undo puts it back', () => {
    const bulk = removeLabelBulk(shonen, works);

    expect(bulk.writes).toEqual([{ collection: labelCollection, rkey: '3lshonen', value: { ...shonen.value, works: ['wd:Q9'] } }]);
    expect(bulk.undo).toEqual([{ collection: labelCollection, rkey: '3lshonen', value: shonen.value }]);
  });
});

describe('Private on or off for many Works', () => {
  test('changes only the Works not kept that way yet, so Undo turns back exactly those', () => {
    expect(privacyChange(['wd:Q1', 'wd:Q2', 'wd:Q3'], true, ['wd:Q2', 'wd:Q7'])).toEqual(['wd:Q1', 'wd:Q3']);
    expect(privacyChange(['wd:Q1', 'wd:Q2', 'wd:Q3'], false, ['wd:Q2', 'wd:Q7'])).toEqual(['wd:Q2']);
  });
});

describe('Move many Editions to a Series', () => {
  const edition = (isbn: string, volume: number | null, corrected = false) =>
    ({ isbn, title: `Book ${isbn}`, volume, volumes: volume === null ? [] : [volume], ...(corrected ? { corrected: true } : {}) }) as unknown as Edition;
  const editions = [edition('9782723434621', 1), edition('9782723434638', null), edition('9782723434645', 3, true)];
  const newSeries = { title: 'Dragon Ball', publisher: 'Glénat', language: 'fre', height: 18 };

  test('into an Edition Line: a known Volume number stays, a typed one fills the missing one', () => {
    expect(moveCorrections(editions, { anchor: '9782723456739' }, { '9782723434638': 2 })).toEqual([
      ['9782723434621', { anchor: '9782723456739', volume: 1 }],
      ['9782723434638', { anchor: '9782723456739', volume: 2 }],
      ['9782723434645', { anchor: '9782723456739', volume: 3 }],
    ]);
  });

  test('a missing Volume number left empty stays none', () => {
    expect(moveCorrections(editions.slice(1, 2), { anchor: '9782723456739' }, {})).toEqual([['9782723434638', { anchor: '9782723456739', volume: null }]]);
  });

  test('into a New Series: the first Edition makes it, the others join its Edition Line', () => {
    expect(moveCorrections(editions, { newSeries }, {}).map(([, correction]) => correction)).toEqual([
      { newSeries, volume: 1 },
      { anchor: '9782723434621', volume: null },
      { anchor: '9782723434621', volume: 3 },
    ]);
  });

  test('Undo sends back to the sources the Editions that had no Series Correction', () => {
    expect(moveUndo(editions)).toEqual(['9782723434621', '9782723434638']);
  });
});
