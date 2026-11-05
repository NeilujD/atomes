import { describe, expect, test } from 'vitest';
import { memorySpace } from './memory-space.fake';
import { lexicons } from './records';
import { listToBuy, saveToBuy, toBuyCollection } from './to-buy';

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
