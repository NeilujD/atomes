import { describe, expect, test } from 'vitest';
import { copyCollection, listCopies, saveCopy, type Copy } from './copy';
import { memorySpace } from './memory-space.fake';
import { lexicons } from './records';

const onePiece56: Copy = {
  isbn: '9782723478991',
  works: ['wd:Q673'],
  createdAt: '2026-11-05T10:00:00.000Z',
};

describe('Copy records', () => {
  test('a saved Copy matches its lexicon and reads back with its key', async () => {
    const { space, stored } = memorySpace();

    const rkey = await saveCopy(space, { ...onePiece56, lentTo: 'Sam', acquiredAt: '2026-10-01T00:00:00.000Z' });

    const [record] = stored(copyCollection);
    expect(() => lexicons.assertValidRecord(copyCollection, record.value)).not.toThrow();
    expect((await listCopies(space)).records).toEqual([
      { rkey, value: { $type: copyCollection, ...onePiece56, lentTo: 'Sam', acquiredAt: '2026-10-01T00:00:00.000Z' } },
    ]);
  });

  test('two Copies of the same Edition are two records', async () => {
    const { space } = memorySpace();

    await saveCopy(space, onePiece56);
    await saveCopy(space, onePiece56);

    expect((await listCopies(space)).records).toHaveLength(2);
  });

  test('a book the Catalog does not know keeps the details the reader typed', async () => {
    const { space } = memorySpace();
    const unknown: Copy = {
      isbn: '9791032722077',
      works: ['isbn:9791032722077'],
      details: { title: 'Jujutsu Kaisen Modulo', authors: ['Gege Akutami'], series: 'Jujutsu Kaisen Modulo', volume: '1' },
      createdAt: '2026-11-05T10:00:00.000Z',
    };

    await saveCopy(space, unknown);

    expect((await listCopies(space)).records[0].value.details?.title).toBe('Jujutsu Kaisen Modulo');
  });

  test.each<[string, Partial<Copy>]>([
    ['an ISBN with a wrong check digit', { isbn: '9782723478992' }],
    ['an ISBN-10', { isbn: '2723478991' }],
    ['sheet music (ISMN)', { isbn: '9790230000006' }],
    ['no Work', { works: [] }],
    ['a Work that is not a Catalog identifier', { works: ['One Piece'] }],
    ['a date that is not a datetime', { acquiredAt: 'last week' }],
    ['manual details with no title', { details: { title: undefined as unknown as string } }],
  ])('%s is refused and nothing is saved', async (_, change) => {
    const { space, stored } = memorySpace();

    await expect(saveCopy(space, { ...onePiece56, ...change })).rejects.toThrow();
    expect(stored(copyCollection)).toEqual([]);
  });

  test('records in another shape, written by another app, are skipped', async () => {
    const { space } = memorySpace();
    await space.put(copyCollection, 'a', { $type: copyCollection, ...onePiece56 });
    await space.put(copyCollection, 'b', { $type: copyCollection, isbn: 42 });
    await space.put(copyCollection, 'c', { $type: copyCollection, title: 'Dune' });

    expect((await listCopies(space)).records.map(({ rkey }) => rkey)).toEqual(['a']);
  });
});
