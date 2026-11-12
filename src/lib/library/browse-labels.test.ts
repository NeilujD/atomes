// Labels in the Library model: what the Label filter and its chips show once
// the reader has attached, renamed or deleted a Label (src/lib/library/label.ts).
import { describe, expect, test } from 'vitest';
import type { Edition } from '../catalog/catalog';
import { allBooks, browse, libraryBooks, liveQuery, type LibraryQuery } from './browse';
import type { Copy } from './copy';
import { labelFor, renamed, type Label } from './label';
import type { Library } from './model';
import type { Saved } from './records';

const edition = (isbn: string, title: string): Edition => ({
  isbn,
  title,
  volumeTitle: null,
  authors: [],
  publisher: null,
  language: null,
  format: null,
  cover: null,
  work: { id: `wd:Q${isbn.slice(-6)}`, title },
  series: null,
  volumes: [],
  volume: null,
  sources: ['BnF'],
  fetchedAt: '2026-11-01T00:00:00.000Z',
});
const dune = edition('9782266320481', 'Dune');
const fondation = edition('9782070360536', 'Fondation');
const onePiece = edition('9782723434621', 'One Piece');
const editions = new Map([dune, fondation, onePiece].map((each) => [each.isbn, each]));

const copy = (each: Edition): Saved<Copy> => ({ rkey: each.isbn, value: { isbn: each.isbn, works: [each.work.id], createdAt: '2026-11-01T00:00:00.000Z' } });
const reader: Library = { copies: [dune, fondation, onePiece].map(copy), readingStatuses: [], follows: [], loans: [], toBuy: [] };
const label = (rkey: string, name: string, works: Edition[]): Saved<Label> => ({
  rkey,
  value: { name, works: works.map((each) => each.work.id), createdAt: '2026-11-01T00:00:00.000Z' },
});
const sciFi = label('3lbsf', 'Sci-fi', [dune]);
const manga = label('3lbma', 'Manga', [onePiece]);

// The Library as the reader's Labels give it, with `query` on.
function find(labels: Saved<Label>[], query: Partial<LibraryQuery> = {}) {
  const found = browse(libraryBooks(reader, editions, labels), labels, { ...allBooks, ...query }, 'fr');
  return { titles: found.books.map(({ title }) => title), chips: found.labels.map(({ name, count }) => [name, count]), filtered: found.filtered };
}

describe('Labels in the Library', () => {
  test('the Label filter finds a book once the Label is on its Work', () => {
    const change = labelFor('sci-fi', fondation.work.id, [sciFi, manga], new Date('2026-11-12T09:00:00.000Z'), 'fr');
    if ('problem' in change) throw new Error(change.problem);

    expect(find([sciFi, manga], { label: '3lbsf' }).titles).toEqual(['Dune']);
    expect(find([{ rkey: '3lbsf', value: change.label }, manga], { label: '3lbsf' }).titles).toEqual(['Dune', 'Fondation']);
  });

  test('a renamed Label keeps its books under the filter, and its chip moves to its new place A to Z', () => {
    const change = renamed(sciFi, 'Anticipation', [sciFi, manga], 'fr');
    if ('problem' in change) throw new Error(change.problem);
    const found = find([{ rkey: '3lbsf', value: change.label }, manga], { label: '3lbsf' });

    expect(found.titles).toEqual(['Dune']);
    expect(found.chips).toEqual([
      ['', 3],
      ['Anticipation', 1],
      ['Manga', 1],
    ]);
  });

  test('a deleted Label leaves the chips and its books', () => {
    expect(find([manga]).chips).toEqual([
      ['', 3],
      ['Manga', 1],
    ]);
    expect(libraryBooks(reader, editions, [manga]).find(({ title }) => title === 'Dune')?.labels).toEqual([]);
  });

  test('a filter on a Label deleted since (on another device) falls away: every book shows', () => {
    const found = find([manga], { label: '3lbsf' });

    expect([found.titles, found.filtered]).toEqual([['Dune', 'Fondation', 'One Piece'], false]);
  });

  test('the query itself drops a Label deleted since, so no filter counts as on; a Label that still exists stays', () => {
    const asked = { ...allBooks, text: 'dune', label: '3lbsf' };

    expect(liveQuery(asked, [manga])).toEqual({ ...allBooks, text: 'dune' });
    expect(liveQuery(asked, [sciFi, manga])).toEqual(asked);
  });
});
