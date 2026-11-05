import { describe, expect, test } from 'vitest';
import { labelCollection, listLabels, saveLabel, type Label } from './label';
import { memorySpace } from './memory-space.fake';
import { lexicons } from './records';

const manga: Label = { name: ' Manga ', works: ['wd:Q673', 'wd:Q673', 'isbn:9791043306471'], createdAt: '2026-11-05T10:00:00.000Z' };

describe('Label records', () => {
  test('a saved Label matches its lexicon, with a trimmed name and each Work once', async () => {
    const { space, stored } = memorySpace();

    await saveLabel(space, manga);

    const [record] = stored(labelCollection);
    expect(() => lexicons.assertValidRecord(labelCollection, record.value)).not.toThrow();
    expect((await listLabels(space)).records[0].value).toMatchObject({ name: 'Manga', works: ['wd:Q673', 'isbn:9791043306471'] });
  });

  test('a rename keeps the same record', async () => {
    const { space } = memorySpace();

    const rkey = await saveLabel(space, manga);
    await saveLabel(space, { ...manga, name: 'Mangas' }, rkey);

    expect((await listLabels(space)).records.map(({ rkey: key, value }) => [key, value.name])).toEqual([[rkey, 'Mangas']]);
  });

  test.each<[string, Partial<Label>]>([
    ['an empty name', { name: '   ' }],
    ['a name over 64 characters', { name: 'x'.repeat(65) }],
    ['a Work that is not a Catalog identifier', { works: ['Dune'] }],
  ])('%s is refused and nothing is saved', async (_, change) => {
    const { space, stored } = memorySpace();

    await expect(saveLabel(space, { ...manga, ...change })).rejects.toThrow();
    expect(stored(labelCollection)).toEqual([]);
  });
});
