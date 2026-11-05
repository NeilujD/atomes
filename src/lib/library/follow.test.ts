import { describe, expect, test } from 'vitest';
import { followCollection, listFollows, saveFollow, type Follow } from './follow';
import { memorySpace } from './memory-space.fake';
import { lexicons } from './records';

const onePiece: Follow = {
  series: 'wd:Q673',
  anchorIsbn: '9782723478991',
  status: 'following',
  updatedAt: '2026-11-05T10:00:00.000Z',
};

describe('Follow records', () => {
  test('a saved follow matches its lexicon and is keyed by its Series', async () => {
    const { space, stored } = memorySpace();

    await saveFollow(space, onePiece);

    const [record] = stored(followCollection);
    expect(record.rkey).toBe('wd:Q673');
    expect(() => lexicons.assertValidRecord(followCollection, record.value)).not.toThrow();
  });

  test('switching Edition Line, then dropping, keeps one record per Series', async () => {
    const { space } = memorySpace();

    await saveFollow(space, onePiece);
    await saveFollow(space, { ...onePiece, anchorIsbn: '9782344001943', fromVolume: '57' });
    await saveFollow(space, { ...onePiece, anchorIsbn: '9782344001943', fromVolume: '57', status: 'dropped' });

    const { records } = await listFollows(space);
    expect(records.map(({ value }) => [value.series, value.anchorIsbn, value.fromVolume, value.status])).toEqual([
      ['wd:Q673', '9782344001943', '57', 'dropped'],
    ]);
  });

  test.each<[string, Partial<Follow>]>([
    ['a Series that is an Edition', { series: 'isbn:9782723478991' }],
    ['a Series that is not a Catalog identifier', { series: 'One Piece' }],
    ['an anchor that is not an ISBN-13', { anchorIsbn: '2723478991' }],
    ['an unknown status', { status: 'paused' as Follow['status'] }],
  ])('%s is refused and nothing is saved', async (_, change) => {
    const { space, stored } = memorySpace();

    await expect(saveFollow(space, { ...onePiece, ...change })).rejects.toThrow();
    expect(stored(followCollection)).toEqual([]);
  });
});
