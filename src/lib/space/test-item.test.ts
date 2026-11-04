import { describe, expect, test } from 'vitest';
import type { Space, SpaceRecord } from './space';
import { listTestItems, saveTestItem } from './test-item';

// A Space that keeps records in a map: the Space contract is tested in space.test.ts.
function memorySpace(seed: SpaceRecord[] = []): Space {
  const records = new Map(seed.map((record): [string, unknown] => [record.rkey, record.value]));
  return {
    ensure: () => Promise.resolve(),
    put: (collection, rkey, value) => {
      records.set(rkey, { $type: collection, ...value });
      return Promise.resolve();
    },
    get: (_, rkey) => Promise.resolve(records.get(rkey)),
    list: () => Promise.resolve({ records: [...records].map(([rkey, value]) => ({ rkey, value })), stale: false }),
  };
}

describe('test items', () => {
  test('save trims the text and lists items newest first', async () => {
    const space = memorySpace();

    await saveTestItem(space, '  first  ', new Date('2026-11-04T10:00:00.000Z'));
    await saveTestItem(space, 'second', new Date('2026-11-04T11:00:00.000Z'));

    expect((await listTestItems(space)).items).toEqual([
      { text: 'second', createdAt: '2026-11-04T11:00:00.000Z' },
      { text: 'first', createdAt: '2026-11-04T10:00:00.000Z' },
    ]);
  });

  test('an empty text is refused and nothing is saved', async () => {
    const space = memorySpace();

    await expect(saveTestItem(space, '   ')).rejects.toThrow('Type a short text.');
    expect((await listTestItems(space)).items).toEqual([]);
  });

  test('records written by another app in a bad shape are skipped', async () => {
    const space = memorySpace([
      { rkey: 'a', value: { text: 'ok', createdAt: '2026-11-04T10:00:00.000Z' } },
      { rkey: 'b', value: { text: 42 } },
      { rkey: 'c', value: null },
    ]);

    expect((await listTestItems(space)).items).toEqual([{ text: 'ok', createdAt: '2026-11-04T10:00:00.000Z' }]);
  });
});
