import { describe, expect, test } from 'vitest';
import type { KeptCatalog } from '../catalog/device';
import type { Space } from '../space/space';
import { saveCopy } from './copy';
import { saveFollow } from './follow';
import { loadLibrary } from './library';
import { memorySpace } from './memory-space.fake';
import type { Library } from './model';
import { keepOnDevice } from './shelf-check';

const onePiece56 = '9782723478991';
const spyFamily16 = '9791042021030';

async function savedLibrary() {
  const { space } = memorySpace();
  await saveCopy(space, { isbn: onePiece56, works: ['wd:Q56'], createdAt: '2026-11-13T10:00:00.000Z' });
  await saveFollow(space, { series: 'wd:Q88456222', anchorIsbn: spyFamily16, status: 'following', updatedAt: '2026-11-13T10:00:00.000Z' });
  return space;
}

describe('loadLibrary keeps the Shelf Check data up to date from every screen that reads the Library', () => {
  test('a read from the store hands the Library to keep: a book added or a Series followed elsewhere is kept too', async () => {
    const kept: Library[] = [];

    await loadLibrary(await savedLibrary(), (library) => kept.push(library));

    expect(kept.map(({ copies, follows }) => [copies.map(({ value }) => value.isbn), follows.map(({ value }) => value.anchorIsbn)])).toEqual([
      [[onePiece56], [spyFamily16]],
    ]);
  });

  test('a stale read (the copy on this device, offline) keeps nothing: there is no network to ask', async () => {
    const space = await savedLibrary();
    const stale: Space = { ...space, list: async (collection) => ({ ...(await space.list(collection)), stale: true }) };
    const kept: Library[] = [];

    await loadLibrary(stale, (library) => kept.push(library));

    expect(kept).toEqual([]);
  });
});

describe('keepOnDevice', () => {
  test('asks only for what is not kept yet: Editions of the Library and Edition Lines of the Followed Series', async () => {
    const asked: unknown[] = [];
    const catalog = { keep: (...args: unknown[]) => (asked.push(args), Promise.resolve(true)) } as unknown as KeptCatalog;
    const { library } = await loadLibrary(await savedLibrary(), () => undefined);

    await keepOnDevice(library, catalog);

    expect(asked).toEqual([[[onePiece56], [spyFamily16]]]);
  });
});
