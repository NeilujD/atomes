// To Buy (glossary): the Missing Volumes of the Followed Series, computed on
// the device, and the Editions the reader added by hand.
//
// `app.atomes.toBuy` holds only the hand-added Editions (ADR 0010): the record
// key is the ISBN, so an Edition is on the list once. Missing Volumes are
// never stored. Never Shared.
import type { Edition } from '../catalog/catalog';
import { coverUrl } from '../catalog/client';
import { compareText, type Language } from '../i18n/i18n';
import type { Space, WriteState } from '../space/space';
import type { Copy } from './copy';
import { editionWork, isIsbn13, readIsbn, type IsbnProblem } from './ids';
import { editionLabel, isOwned, type Editions, type Library } from './model';
import { listRecords, putRecord } from './records';

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

// The Volumes the Catalog knows in the Edition Line of each Followed Series,
// by Series identifier (`/volumes` of the follow's anchor ISBN). A Series
// missing here could not be asked (offline): it shows no Missing Volume.
export type EditionLines = ReadonlyMap<string, Edition[]>;

export interface ToBuyItem {
  isbn: string;
  // The Work the Copy contains when the reader buys it.
  work: string;
  title: string;
  // The Catalog identifier and title of the Series, when the Edition has one.
  seriesId: string | null;
  series: string | null;
  volume: number | null;
  // A path on the Atomes server.
  cover: string | null;
  // Publisher and language, as far as the Catalog knows them.
  edition: string;
  // It has an `app.atomes.toBuy` record: the reader can remove it, and buying it deletes the record.
  byHand: boolean;
}

export interface ToBuyList {
  // By Series title, then by Volume.
  missing: ToBuyItem[];
  // Latest added first. An Edition that is also a Missing Volume is listed there only.
  byHand: ToBuyItem[];
}

export function toBuyList(library: Library, lines: EditionLines, editions: Editions, language: Language): ToBuyList {
  const listed = new Set(library.toBuy.map(({ value }) => value.isbn));
  const missing = library.follows
    .filter(({ value }) => value.status === 'following')
    .flatMap(({ rkey }) => missingVolumes(lines.get(rkey) ?? [], library))
    .map((edition) => item(edition.isbn, edition, listed.has(edition.isbn), language))
    .sort((a, b) => compareText(language)(a.series ?? '', b.series ?? '') || (a.volume ?? 0) - (b.volume ?? 0));

  const inMissing = new Set(missing.map(({ isbn }) => isbn));
  const byHand = library.toBuy
    .filter(({ value }) => !inMissing.has(value.isbn) && !isOwned(owned(value.isbn, editions), library))
    .sort((a, b) => b.value.createdAt.localeCompare(a.value.createdAt))
    .map(({ value }) => item(value.isbn, editions.get(value.isbn), true, language));
  return { missing, byHand };
}

export interface SeriesGroup {
  // The Series identifier, or null for the books of no Series.
  id: string | null;
  title: string | null;
  items: ToBuyItem[];
}

// One group per Series, in the order of the items (toBuyList sorts the
// Missing Volumes by Series title, then Volume).
export function bySeries(items: ToBuyItem[]): SeriesGroup[] {
  const groups = new Map<string | null, SeriesGroup>();
  for (const each of items) {
    const group = groups.get(each.seriesId) ?? { id: each.seriesId, title: each.series, items: [] };
    group.items.push(each);
    groups.set(each.seriesId, group);
  }
  return [...groups.values()];
}

// The Missing Volumes (glossary) of one Edition Line: numbered Volumes before
// the latest one the reader owns, of which they own no printing. A Volume
// counts as owned by ISBN or by Work (isOwned), so a Copy from another
// Edition Line of the Series counts too.
export function missingVolumes(volumes: Edition[], library: Library): Edition[] {
  const byVolume = new Map<number, Edition[]>();
  for (const each of volumes) {
    if (each.volume !== null) byVolume.set(each.volume, [...(byVolume.get(each.volume) ?? []), each]);
  }
  const owned = [...byVolume].filter(([, printings]) => printings.some((each) => isOwned(each, library))).map(([volume]) => volume);
  const latest = Math.max(0, ...owned);
  return [...byVolume]
    .filter(([volume]) => volume < latest && !owned.includes(volume))
    .sort(([a], [b]) => a - b)
    .map(([, printings]) => printings[0]);
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
    title: edition?.title ?? `ISBN ${isbn}`,
    seriesId: edition?.series?.id ?? null,
    series: edition?.series?.title ?? null,
    volume: edition?.volume ?? null,
    cover: edition ? coverUrl(edition) : null,
    edition: editionLabel(edition, language),
    byHand,
  };
}
