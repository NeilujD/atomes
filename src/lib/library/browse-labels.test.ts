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

// One Piece as the Catalog names it now; a Label may hold its older identifier.
const onePieceSeries = { id: 'wd:Q673', title: 'One Piece', sameAs: ['inv:0123456789abcdef0123456789abcdef'] };
const onePieceVolume = (n: number, isbn: string): Edition => ({
  ...edition(isbn, 'One Piece'),
  work: { id: `wd:Q9000${n}`, title: `One Piece ${n}` },
  series: onePieceSeries,
  volumes: [n],
  volume: n,
});
const volume1 = onePieceVolume(1, '9782723488525');
const volume2 = onePieceVolume(2, '9782723489898');
const seriesLabel = (rkey: string, name: string, series: string[], works: Edition[] = []): Saved<Label> => ({
  rkey,
  value: { name, works: works.map((each) => each.work.id), series, createdAt: '2026-11-01T00:00:00.000Z' },
});

// The Library of a reader with Copies of Dune and `volumes`, as the Catalog answered `known`.
function seriesReader(volumes: Edition[], labels: Saved<Label>[], known = new Map([dune, ...volumes].map((each) => [each.isbn, each]))) {
  const library: Library = { copies: [dune, ...volumes].map(copy), readingStatuses: [], follows: [], loans: [], toBuy: [] };
  return libraryBooks(library, known, labels);
}
// The Works the filter on Label `rkey` finds.
const filtered = (books: ReturnType<typeof libraryBooks>, labels: Saved<Label>[], rkey: string) =>
  browse(books, labels, { ...allBooks, label: rkey }, 'fr').books.map(({ work }) => work);

describe('Labels on a Series in the Library', () => {
  test('a Work matches the filter by its own Label', () => {
    const labels = [seriesLabel('3lbsh', 'Shōnen', [], [volume2])];

    expect(filtered(seriesReader([volume1, volume2], labels), labels, '3lbsh')).toEqual([volume2.work.id]);
  });

  test('every Work of the Series matches the filter through its Series, and a Volume added later too', () => {
    const labels = [seriesLabel('3lbsh', 'Shōnen', [onePieceSeries.id])];

    expect(filtered(seriesReader([volume1], labels), labels, '3lbsh')).toEqual([volume1.work.id]);
    expect(filtered(seriesReader([volume1, volume2], labels), labels, '3lbsh')).toEqual([volume1.work.id, volume2.work.id]);
  });

  test('a Series Label saved under an older `sameAs` identifier finds the Series', () => {
    const labels = [seriesLabel('3lbsh', 'Shōnen', onePieceSeries.sameAs)];

    expect(filtered(seriesReader([volume1, volume2], labels), labels, '3lbsh')).toEqual([volume1.work.id, volume2.work.id]);
  });

  test('the chip counts each Work once, whether it carries the Label or gets it from its Series', () => {
    const labels = [seriesLabel('3lbsh', 'Shōnen', [onePieceSeries.id], [volume1])];

    expect(browse(seriesReader([volume1, volume2], labels), labels, allBooks, 'fr').labels.map(({ name, count }) => [name, count])).toEqual([
      ['', 3],
      ['Shōnen', 2],
    ]);
  });

  test('a Work whose Edition the Catalog has not answered yet shows no Series Label, and the others still do', () => {
    const labels = [seriesLabel('3lbsh', 'Shōnen', [onePieceSeries.id])];
    const books = seriesReader([volume1, volume2], labels, new Map([dune, volume1].map((each) => [each.isbn, each])));

    expect(filtered(books, labels, '3lbsh')).toEqual([volume1.work.id]);
  });
});
