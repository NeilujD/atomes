// To Buy (glossary): the Volumes of the Followed Series that the reader does
// not own, computed on the device, and the Editions they added by hand.
//
// `app.atomes.toBuy` holds only the hand-added Editions (ADR 0010): the record
// key is the ISBN, so an Edition is on the list once. The Volumes of the
// Followed Series are never stored. Never Shared.
import type { Edition } from '../catalog/catalog';
import { coverUrl } from '../catalog/client';
import { compareText, translator, type Language } from '../i18n/i18n';
import type { Space, WriteState } from '../space/space';
import type { Copy } from './copy';
import { editionWork, isIsbn13, readIsbn, type IsbnProblem } from './ids';
import { editionLabel, isOwned, type Editions, type Library } from './model';
import { listRecords, putRecord } from './records';
import { collectedVolumes, notOwnedVolumes, type EditionLines } from './series';

export const toBuyCollection = 'app.atomes.toBuy';

export interface ToBuy {
  isbn: string;
  createdAt: string;
}

export async function saveToBuy(space: Space, toBuy: ToBuy): Promise<WriteState> {
  if (!isIsbn13(toBuy.isbn)) throw new Error(`Not an ISBN-13: ${toBuy.isbn}`);
  return putRecord(space, toBuyCollection, toBuy.isbn, toBuy);
}

export function deleteToBuy(space: Space, isbn: string): Promise<WriteState> {
  return space.delete(toBuyCollection, isbn);
}

export function listToBuy(space: Space) {
  return listRecords<ToBuy>(space, toBuyCollection);
}

export interface ToBuyItem {
  isbn: string;
  // The Work the Copy contains when the reader buys it.
  work: string;
  title: string;
  // The Catalog identifier and title of the Series, when the Edition has one.
  seriesId: string | null;
  series: string | null;
  volume: number | null;
  // All its Volumes: several for an omnibus.
  volumes: number[];
  // A path on the Atomes server.
  cover: string | null;
  // Publisher and language, as far as the Catalog knows them.
  edition: string;
  // It has an `app.atomes.toBuy` record: the reader can remove it, and buying it deletes the record.
  byHand: boolean;
}

export interface ToBuyList {
  // The Volumes of the Followed Series the reader does not own, by Series title, then by Volume.
  followed: ToBuyItem[];
  // Latest added first. An Edition that is also in `followed` is listed there only.
  byHand: ToBuyItem[];
}

// `lines`: the Edition Lines of the Followed Series, by anchor ISBN (and, after
// a switch, the earlier line: series.ts). A Series whose line could not be
// asked (offline) shows no Volume. `editions`: the Catalog's Editions of the
// hand-added ISBNs and, after a switch, of the Copies.
export function toBuyList(library: Library, lines: EditionLines, editions: Editions, language: Language): ToBuyList {
  const listed = new Set(library.toBuy.map(({ value }) => value.isbn));
  const followed = library.follows
    .filter(({ value }) => value.status === 'following')
    .flatMap(({ value }) => notOwnedVolumes(collectedVolumes(value, library, lines, editions) ?? [], library))
    .map((edition) => item(edition.isbn, edition, listed.has(edition.isbn), language))
    .sort((a, b) => compareText(language)(a.series ?? '', b.series ?? '') || (a.volume ?? 0) - (b.volume ?? 0));

  const inFollowed = new Set(followed.map(({ isbn }) => isbn));
  const byHand = library.toBuy
    .filter(({ value }) => !inFollowed.has(value.isbn) && !isOwned(owned(value.isbn, editions), library))
    .sort((a, b) => b.value.createdAt.localeCompare(a.value.createdAt))
    .map(({ value }) => item(value.isbn, editions.get(value.isbn), true, language));
  return { followed, byHand };
}

export interface SeriesGroup {
  // The Series identifier, or null for the books of no Series.
  id: string | null;
  title: string | null;
  // Its Volume numbers as runs, for example "3–55, 57–113"; empty when none has a number.
  volumes: string;
  items: ToBuyItem[];
}

// One group per Series, in the order of the items (toBuyList sorts the
// Volumes of the Followed Series by Series title, then Volume).
export function bySeries(items: ToBuyItem[]): SeriesGroup[] {
  const groups = new Map<string | null, ToBuyItem[]>();
  for (const each of items) groups.set(each.seriesId, [...(groups.get(each.seriesId) ?? []), each]);
  return [...groups.values()].map((group) => ({ id: group[0].seriesId, title: group[0].series, volumes: runs(group), items: group }));
}

// "3–55, 57–113": the Volume numbers of the items, consecutive ones joined.
function runs(items: ToBuyItem[]): string {
  const numbers = [...new Set(items.flatMap(({ volumes }) => volumes))].sort((a, b) => a - b);
  const found: [number, number][] = [];
  for (const each of numbers) {
    const last = found.at(-1);
    if (last && each === last[1] + 1) last[1] = each;
    else found.push([each, each]);
  }
  return found.map(([from, to]) => (from === to ? `${from}` : `${from}–${to}`)).join(', ');
}

// What to save when the reader says "I bought it": the Copy, and the hand-added record to delete, if any.
export function bought(item: ToBuyItem, now: Date): { copy: Copy; remove: string | undefined } {
  return { copy: { isbn: item.isbn, works: [item.work], createdAt: now.toISOString() }, remove: item.byHand ? item.isbn : undefined };
}

// The record to save when the reader adds an Edition by hand, or why not.
export type HandAddProblem = IsbnProblem | 'owned' | 'listed';

export function handAdd(typed: string, library: Library, editions: Editions, now: Date): { toBuy: ToBuy } | { problem: HandAddProblem } {
  const read = readIsbn(typed);
  if ('problem' in read) return read;
  if (isOwned(owned(read.isbn, editions), library)) return { problem: 'owned' };
  if (library.toBuy.some(({ value }) => value.isbn === read.isbn)) return { problem: 'listed' };
  return { toBuy: { isbn: read.isbn, createdAt: now.toISOString() } };
}

// What isOwned needs of an Edition: its Work when the Catalog knows it, else
// the `isbn:` Work a Copy of an unknown Edition gets.
function owned(isbn: string, editions: Editions): Pick<Edition, 'isbn' | 'work'> {
  return editions.get(isbn) ?? { isbn, work: { id: editionWork(isbn), title: '' } };
}

function item(isbn: string, edition: Edition | undefined, byHand: boolean, language: Language): ToBuyItem {
  return {
    isbn,
    work: edition?.work.id ?? editionWork(isbn),
    title: edition?.title ?? translator(language)('book.isbn', isbn),
    seriesId: edition?.series?.id ?? null,
    series: edition?.series?.title ?? null,
    volume: edition?.volume ?? null,
    volumes: edition?.volumes ?? [],
    cover: edition ? coverUrl(edition) : null,
    edition: editionLabel(edition, language),
    byHand,
  };
}
