import { afterEach, expect, test, vi } from 'vitest';
import { lookupEdition, lookupVolumes } from './client';

afterEach(() => {
  vi.unstubAllGlobals();
});

// What the service worker may still hold offline: answers from before omnibus Volumes.
const before = (isbn: string, volume: number | null) => ({ isbn, title: 'One Piece', volume });

test('an answer kept from before omnibus Volumes gets its one Volume as its Volumes', async () => {
  vi.stubGlobal('fetch', (url: string) =>
    Promise.resolve(
      url.endsWith('/volumes')
        ? Response.json({ series: null, volumes: [before('9782723478991', 56), before('9782723478992', null)] })
        : Response.json(before('9782723478991', 56)),
    ),
  );

  const found = await lookupEdition('9782723478991');
  const line = await lookupVolumes('9782723478991');

  expect('found' in found && found.found.volumes).toEqual([56]);
  expect(line?.volumes.map(({ volumes }) => volumes)).toEqual([[56], []]);
});

test('an omnibus answer keeps all its Volumes', async () => {
  vi.stubGlobal('fetch', () => Promise.resolve(Response.json({ ...before('9782344025437', 1), volumes: [1, 2] })));

  const found = await lookupEdition('9782344025437');

  expect('found' in found && found.found.volumes).toEqual([1, 2]);
});
