import { describe, expect, test } from 'vitest';
import type { Space, WriteState } from '../space/space';
import { saveCopy } from './copy';
import { saveFollow } from './follow';
import { saveLabel } from './label';
import { memorySpace } from './memory-space.fake';
import { saveReadingStatus } from './reading-status';
import { saveToBuy } from './to-buy';

const createdAt = '2026-11-05T10:00:00.000Z';
const saves: [string, (space: Space) => Promise<WriteState>][] = [
  ['Copy', async (space) => (await saveCopy(space, { isbn: '9782723478991', works: ['wd:Q673'], createdAt })).state],
  ['Label', async (space) => (await saveLabel(space, { name: 'Manga', works: ['wd:Q673'], createdAt })).state],
  ['To Buy', (space) => saveToBuy(space, { isbn: '9791043306471', createdAt })],
  ['Follow', (space) => saveFollow(space, { series: 'wd:Q673', anchorIsbn: '9782723478991', status: 'following', updatedAt: createdAt })],
  ['Reading Status', (space) => saveReadingStatus(space, { work: 'wd:Q190192', isbn: '9782266320542', status: 'reading', updatedAt: createdAt })],
];

// The screens tell the reader when a save waits on this device or the PDS refused it.
describe.each<WriteState>(['sent', 'waiting', 'refused'])('a %s write', (state) => {
  test.each(saves)('%s save reports it', async (_, save) => {
    const { space } = memorySpace(state);

    expect(await save(space)).toBe(state);
  });
});
