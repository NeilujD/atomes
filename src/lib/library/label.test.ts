import { describe, expect, test } from 'vitest';
import type { Space } from '../space/queued-store';
import {
  attachSeries,
  deleteLabel,
  detach,
  detachSeries,
  labelCollection,
  labelFor,
  listLabels,
  renamed,
  saveLabel,
  seriesLabelFor,
  seriesLabels,
  workLabels,
  type Label,
} from './label';
import { memorySpace } from './memory-space.fake';
import { lexicons, type Saved } from './records';

const manga: Label = { name: ' Manga ', works: ['wd:Q673', 'wd:Q673', 'isbn:9791043306471'], createdAt: '2026-11-05T10:00:00.000Z' };

describe('Label records', () => {
  test('a saved Label matches its lexicon, with a trimmed name and each Work once', async () => {
    const { space, stored } = memorySpace();

    await saveLabel(space, manga);

    const [record] = stored(labelCollection);
    expect(() => lexicons.assertValidRecord(labelCollection, record.value)).not.toThrow();
    expect((await listLabels(space)).records[0].value).toMatchObject({ name: 'Manga', works: ['wd:Q673', 'isbn:9791043306471'] });
  });

  test('a Label on a Series matches its lexicon, with each Series once', async () => {
    const { space, stored } = memorySpace();

    await saveLabel(space, { name: 'Shōnen', works: [], series: ['wd:Q673', 'wd:Q673'], createdAt: '2026-11-05T10:00:00.000Z' });

    const [record] = stored(labelCollection);
    expect(() => lexicons.assertValidRecord(labelCollection, record.value)).not.toThrow();
    expect((await listLabels(space)).records[0].value).toMatchObject({ works: [], series: ['wd:Q673'] });
  });

  test('a Label saved before Series Labels, with no `series`, still matches its lexicon', () => {
    expect(() => lexicons.assertValidRecord(labelCollection, { $type: labelCollection, name: 'Manga', works: ['wd:Q673'], createdAt: manga.createdAt })).not.toThrow();
  });

  test('a rename keeps the same record', async () => {
    const { space } = memorySpace();

    const { rkey } = await saveLabel(space, manga);
    await saveLabel(space, { ...manga, name: 'Mangas' }, rkey);

    expect((await listLabels(space)).records.map(({ rkey: key, value }) => [key, value.name])).toEqual([[rkey, 'Mangas']]);
  });

  test.each<[string, Partial<Label>]>([
    ['an empty name', { name: '   ' }],
    ['a name over 64 characters', { name: 'x'.repeat(65) }],
    ['a Work that is not a Catalog identifier', { works: ['Dune'] }],
    ['a Series that is not a Catalog identifier', { series: ['One Piece'] }],
    ['a Series given as an Edition Work', { series: ['isbn:9791043306471'] }],
  ])('%s is refused and nothing is saved', async (_, change) => {
    const { space, stored } = memorySpace();

    await expect(saveLabel(space, { ...manga, ...change })).rejects.toThrow();
    expect(stored(labelCollection)).toEqual([]);
  });
});

const dune = 'wd:Q190192';
const fondation = 'wd:Q753894';
const now = new Date('2026-11-12T09:00:00.000Z');
const saved = (rkey: string, name: string, works: string[]): Saved<Label> => ({ rkey, value: { name, works, createdAt: '2026-11-05T10:00:00.000Z' } });
// The reader's Labels: Sci-fi on both books, Classics on Fondation, Été on none.
const mine = [saved('3lbsf', 'Sci-fi', [dune, fondation]), saved('3lbet', 'Été', []), saved('3lbcl', 'Classics', [fondation])];
const named = (each: Saved<Label>[]) => each.map(({ value }) => value.name);

describe('The Labels of a Work', () => {
  test('the ones it carries, then the reader’s others to pick from, each A to Z', () => {
    const { carried, others } = workLabels(fondation, mine, 'fr');

    expect([named(carried), named(others)]).toEqual([['Classics', 'Sci-fi'], ['Été']]);
    expect(named(workLabels(dune, mine, 'fr').others)).toEqual(['Classics', 'Été']);
  });

  test('all the reader’s Labels, A to Z, to rename or delete: "Été" goes with the E’s', () => {
    expect(named(workLabels(dune, mine, 'fr').all)).toEqual(['Classics', 'Été', 'Sci-fi']);
  });
});

// One Piece as the Catalog names it now, and the older identifier it had.
const onePiece = { id: 'wd:Q673', sameAs: ['inv:0123456789abcdef0123456789abcdef'] };
const onePieceVolume = 'wd:Q90001';

describe('Labels on a Series', () => {
  // Shōnen on One Piece, saved under its older identifier; Seinen on no Series; Manga on the Volume itself.
  const shonen = { rkey: '3lbsh', value: { name: 'Shōnen', works: [], series: [onePiece.sameAs[0]], createdAt: '2026-11-05T10:00:00.000Z' } };
  const seinen = saved('3lbse', 'Seinen', []);
  const mangaOn = saved('3lbma', 'Manga', [onePieceVolume]);
  const labels = [shonen, seinen, mangaOn];

  test('a Work of the Series shows the Series Labels apart from its own, found by any identifier of the Series', () => {
    const { carried, fromSeries, others } = workLabels(onePieceVolume, labels, 'fr', onePiece);

    expect([named(carried), named(fromSeries), named(others)]).toEqual([['Manga'], ['Shōnen'], ['Seinen']]);
  });

  test('a Work with no Series known has no Series Labels', () => {
    expect(named(workLabels(onePieceVolume, labels, 'fr').fromSeries)).toEqual([]);
    expect(named(workLabels(onePieceVolume, labels, 'fr', null).others)).toEqual(['Seinen', 'Shōnen']);
  });

  test('the Series page lists the Labels on the Series, then the others to pick from', () => {
    const { carried, others } = seriesLabels(onePiece, labels, 'fr');

    expect([named(carried), named(others)]).toEqual([['Shōnen'], ['Manga', 'Seinen']]);
  });

  test('a typed name makes a Label on the Series alone, or adds the Series to the Label of that name', () => {
    expect(seriesLabelFor(' Action ', onePiece, labels, now, 'fr')).toEqual({ label: { name: 'Action', works: [], series: ['wd:Q673'], createdAt: now.toISOString() } });
    expect(seriesLabelFor('seinen', onePiece, labels, now, 'fr')).toEqual({ label: { ...seinen.value, series: ['wd:Q673'] }, rkey: '3lbse' });
    expect(seriesLabelFor(' ', onePiece, labels, now, 'fr')).toEqual({ problem: 'empty' });
  });

  test('attaching a Series it already has, under an older identifier, keeps it once under the best one', () => {
    expect(attachSeries(shonen.value, onePiece).series).toEqual(['wd:Q673']);
  });

  test('a Label taken off a Series loses every identifier of the Series and keeps its Works', () => {
    const both: Label = { ...mangaOn.value, series: ['wd:Q673', onePiece.sameAs[0], 'wd:Q1000001'] };

    expect(detachSeries(both, onePiece)).toEqual({ ...mangaOn.value, series: ['wd:Q1000001'] });
  });
});

// Every Label in the Space, as [name, Works], in key order.
const labelsIn = async (space: Space) => (await listLabels(space)).records.map(({ value }) => [value.name, value.works]);
// A Space that holds `labels`.
async function spaceWith(labels: Saved<Label>[]) {
  const { space } = memorySpace();
  for (const { rkey, value } of labels) await saveLabel(space, value, rkey);
  return space;
}

describe('Label changes, saved', () => {
  test('a new name makes a Label that the Work carries', async () => {
    const space = await spaceWith([]);
    const change = labelFor(' Manga ', dune, [], now, 'fr');

    if ('problem' in change) throw new Error(change.problem);
    await saveLabel(space, change.label, change.rkey);

    expect((await listLabels(space)).records.map(({ value }) => value)).toMatchObject([{ name: 'Manga', works: [dune], createdAt: '2026-11-12T09:00:00.000Z' }]);
  });

  test('a name the reader already has, whatever its case and accents, adds the Work to that Label', async () => {
    const space = await spaceWith(mine);
    const change = labelFor('ete', dune, mine, now, 'fr');

    if ('problem' in change) throw new Error(change.problem);
    await saveLabel(space, change.label, change.rkey);

    expect(await labelsIn(space)).toEqual([
      ['Sci-fi', [dune, fondation]],
      ['Été', [dune]],
      ['Classics', [fondation]],
    ]);
  });

  test('a name with no letter is a problem, and there is nothing to save', () => {
    expect(labelFor('   ', dune, mine, now, 'fr')).toEqual({ problem: 'empty' });
  });

  test('a Label removed from a Work stays, with its other Works', async () => {
    const space = await spaceWith(mine);

    await saveLabel(space, detach(mine[0].value, dune), mine[0].rkey);
    await saveLabel(space, detach(mine[2].value, fondation), mine[2].rkey);

    expect(await labelsIn(space)).toEqual([
      ['Sci-fi', [fondation]],
      ['Été', []],
      ['Classics', []],
    ]);
  });

  test('a renamed Label keeps its key and its Works', async () => {
    const space = await spaceWith(mine);
    const change = renamed(mine[0], ' SF ', mine, 'fr');

    if ('problem' in change) throw new Error(change.problem);
    await saveLabel(space, change.label, mine[0].rkey);

    expect((await listLabels(space)).records.map(({ rkey, value }) => [rkey, value.name, value.works])).toEqual([
      ['3lbsf', 'SF', [dune, fondation]],
      ['3lbet', 'Été', []],
      ['3lbcl', 'Classics', [fondation]],
    ]);
  });

  test.each([
    ['the name of another Label, whatever its case and accents', 'ete', { problem: 'taken' }],
    ['no name', '  ', { problem: 'empty' }],
  ])('a Label cannot be renamed to %s', (_, typed, expected) => {
    expect(renamed(mine[2], typed, mine, 'fr')).toEqual(expected);
  });

  test('a Label can change the case of its own name', () => {
    expect(renamed(mine[2], 'CLASSICS', mine, 'fr')).toMatchObject({ label: { name: 'CLASSICS' } });
  });

  test('a deleted Label is gone, and the others stay', async () => {
    const space = await spaceWith(mine);

    await deleteLabel(space, '3lbsf');

    expect(await labelsIn(space)).toEqual([
      ['Été', []],
      ['Classics', [fondation]],
    ]);
  });
});
