import { describe, expect, test } from 'vitest';
import { memorySpace } from './memory-space.fake';
import { listReadingStatuses, readingStatusCollection, saveReadingStatus, type ReadingStatus } from './reading-status';
import { lexicons } from './records';

const dune: ReadingStatus = {
  work: 'wd:Q190192',
  isbn: '9782266320542',
  status: 'reading',
  updatedAt: '2026-11-05T10:00:00.000Z',
};

describe('Reading Status records', () => {
  test('a saved Reading Status matches its lexicon and is keyed by its Work', async () => {
    const { space, stored } = memorySpace();

    await saveReadingStatus(space, dune);

    const [record] = stored(readingStatusCollection);
    expect(record.rkey).toBe('wd:Q190192');
    expect(() => lexicons.assertValidRecord(readingStatusCollection, record.value)).not.toThrow();
  });

  test('a Work has one Reading Status: saving again replaces it', async () => {
    const { space } = memorySpace();

    await saveReadingStatus(space, dune);
    await saveReadingStatus(space, {
      ...dune,
      status: 'read',
      finishedAt: '2026-11-20T00:00:00.000Z',
      updatedAt: '2026-11-20T09:00:00.000Z',
    });

    const { records } = await listReadingStatuses(space);
    expect(records.map(({ rkey, value }) => [rkey, value.status, value.finishedAt])).toEqual([
      ['wd:Q190192', 'read', '2026-11-20T00:00:00.000Z'],
    ]);
  });

  test('a Work the Catalog does not know is keyed by its Edition', async () => {
    const { space, stored } = memorySpace();

    await saveReadingStatus(space, { ...dune, work: 'isbn:9791032722077', isbn: '9791032722077' });

    expect(stored(readingStatusCollection)[0].rkey).toBe('isbn:9791032722077');
  });

  test.each<[string, Partial<ReadingStatus>]>([
    ['a Work that is not a Catalog identifier', { work: 'Dune' }],
    ['an ISBN with a wrong check digit', { isbn: '9782266320543' }],
    ['an unknown status', { status: 'lent' as ReadingStatus['status'] }],
    ['a finish date that is not a datetime', { finishedAt: '2026-11' }],
  ])('%s is refused and nothing is saved', async (_, change) => {
    const { space, stored } = memorySpace();

    await expect(saveReadingStatus(space, { ...dune, ...change })).rejects.toThrow();
    expect(stored(readingStatusCollection)).toEqual([]);
  });
});
