// Shelf Check (glossary): whether the reader owns a book, has read it, or is
// missing it from a Followed Series. Pure, so the online answer of Check a
// book and the offline one (CORE-37) are the same rule.
import type { Edition, Lookup, Series } from '../catalog/catalog';
import { deviceCatalog, type DeviceCatalog, type KeptCatalog } from '../catalog/device';
import { isNetworkFailure } from '../network';
import { editionWork, isSeries } from './ids';
import { currentStatus, isOwned, type Library } from './model';
import type { Status } from './reading-status';
import { missingVolumes, seriesStanding, spineState, type SpineState } from './series';

// owned: a Copy of the Edition or of its Work. missing: a Missing Volume of a
// Followed Series. read: a Reading Status other than unread, and no Copy
// (borrowed, library, ebook). new: none of these. unknown: offline, this
// device cannot tell, so it says "check online later", never a wrong answer.
export type ShelfCheckKind = 'owned' | 'missing' | 'read' | 'new' | 'unknown';

export interface ShelfCheck {
  kind: ShelfCheckKind;
  // The Reading Status of the Work; unread when it has none.
  status: Status;
  // The Followed Series the book is a Volume of, if any.
  followed: Series | null;
  // A Volume of a Series: where the reader stands in their Edition Line
  // (readerLine). Absent for a book of no Series, or when that line could not
  // be asked (offline, not on this device).
  series?: SeriesLine;
}

// The Series card of the answer: "3 owned · 1 read", a segment per Volume,
// and "You have 3 of 112 · 54 missing".
export interface SeriesLine {
  // Volumes owned and read, and Missing Volumes, as on the Series page (seriesStanding).
  owned: number;
  read: number;
  missing: number;
  // The numbers of the Volumes owned, and of the Volumes read (owned or not).
  ownedVolumes: number[];
  readVolumes: number[];
  // The highest Volume number the Catalog lists: a Volume it lacks before it counts.
  total: number;
  // Neither followed nor dropped: the answer offers Follow.
  followable: boolean;
}

// What a Shelf Check needs of an Edition.
type Checked = Pick<Edition, 'work' | 'series' | 'volumes'>;

const unknown: ShelfCheck = { kind: 'unknown', status: 'unread', followed: null };

// The anchor ISBN of the Followed Series of `edition`, to ask the Catalog for
// its Edition Line (`/volumes`); undefined when the Series is not followed.
export function followedLine(edition: Checked | undefined, library: Library): string | undefined {
  return followOf(edition, library)?.value.anchorIsbn;
}

// The anchor ISBN of the reader's Edition Line in the Series of `edition`:
// the one of their follow (followed or dropped), else the line of this
// Edition. Undefined for a book of no Series.
export function readerLine(edition: Pick<Edition, 'isbn' | 'series'> | undefined, library: Library): string | undefined {
  const series = edition?.series;
  if (!series) return undefined;
  return library.follows.find(({ rkey }) => isSeries(series, rkey))?.value.anchorIsbn ?? edition.isbn;
}

// `edition`: the Catalog's Edition of `isbn`, undefined when no source knows
// it (its Work is then `isbn:<isbn>`, ADR 0010). `line`: the reader's
// Edition Line (readerLine), undefined when it could not be asked: the book
// is then never called missing, and has no Series line.
export function shelfCheck(isbn: string, edition: Checked | undefined, library: Library, line: Edition[] | undefined): ShelfCheck {
  const work = edition?.work.id ?? editionWork(isbn);
  const status = currentStatus(work, library);
  const followed = followOf(edition, library) ? (edition?.series ?? null) : null;
  const volumes = edition?.volumes ?? [];
  const missing = line !== undefined && missingVolumes(line, library).some((each) => each.volumes.some((n) => volumes.includes(n)));
  const series = line && seriesLine(edition?.series, line, library);
  const counts = series && { series };
  if (isOwned({ isbn, work: { id: work, title: '' } }, library)) return { kind: 'owned', status, followed, ...counts };
  if (line && missing && followed) return { kind: 'missing', status, followed, ...counts };
  return { kind: status !== 'unread' ? 'read' : 'new', status, followed, ...counts };
}

// Undefined for a book of no Series, or a line with no numbered Volume.
function seriesLine(series: Series | null | undefined, line: Edition[], library: Library): SeriesLine | undefined {
  if (!series) return undefined;
  const standing = seriesStanding(line, library);
  const total = standing.spines.at(-1)?.volume;
  if (total === undefined) return undefined;
  const followable = !library.follows.some(({ rkey }) => isSeries(series, rkey));
  const numbers = (...states: SpineState[]) => standing.spines.filter(({ state }) => states.includes(state)).map(({ volume }) => volume);
  return {
    owned: standing.owned,
    read: standing.read,
    missing: standing.missing.length,
    ownedVolumes: numbers('owned', 'read'),
    readVolumes: numbers('read', 'read-not-owned'),
    total,
    followable,
  };
}

// How the Series card draws the Edition Line: up to 30 Volumes, one segment
// per Volume, in the state of its spine on the Series page (read, owned, read
// not owned, not owned) or this book; more, one bar filled to the share
// owned, with a mark at this book (`at`, 0 to 1). `volumes`: the Volumes of
// this book, none for a book with no number.
export type SeriesBar = { segments: (SpineState | 'this')[] } | { ownedShare: number; at: number | undefined };

export const mostSegments = 30;

export function seriesBar({ total, ownedVolumes, readVolumes }: Pick<SeriesLine, 'total' | 'ownedVolumes' | 'readVolumes'>, volumes: number[]): SeriesBar {
  if (total > mostSegments) {
    const first = volumes.find((volume) => volume >= 1 && volume <= total);
    return { ownedShare: ownedVolumes.length / total, at: first === undefined ? undefined : (first - 0.5) / total };
  }
  return {
    segments: Array.from({ length: total }, (_, at) => {
      const volume = at + 1;
      return volumes.includes(volume) ? 'this' : spineState(ownedVolumes.includes(volume), readVolumes.includes(volume));
    }),
  };
}

// The Shelf Check with no network: from the Library on this device and the
// Catalog data it keeps (keptOnDevice), never asking anything. The Edition is
// its Volume in a kept Edition Line of a Followed Series, else the kept answer
// for the ISBN: an Edition is kept once, a line is asked again as it grows, so
// the line's copy is the newer one. When the device lacks what the answer
// needs, it is `unknown`: a book it does not know, or a Volume of a Followed
// Series whose Edition Line it does not have (it could be missing). The
// device keeps the lines of Followed Series only: for another Series, the
// Series line shows only when an earlier answer for its line is still here.
export async function deviceShelfCheck(
  isbn: string,
  library: Library,
  device: DeviceCatalog,
): Promise<{ check: ShelfCheck; edition: Edition | undefined }> {
  const lines = new Map(await Promise.all(followedAnchors(library).map(async (anchor) => [anchor, await device.line(anchor)] as const)));
  const edition = [...lines.values()].flatMap((each) => each ?? []).find((each) => each.isbn === isbn) ?? (await device.edition(isbn));
  if (!edition) {
    // A record of exactly this ISBN still tells: owned or read.
    const work =
      library.copies.find(({ value }) => value.isbn === isbn)?.value.works[0] ??
      library.readingStatuses.find(({ value }) => value.isbn === isbn)?.rkey;
    const check = work && shelfCheck(isbn, { work: { id: work, title: '' }, series: null, volumes: [] }, library, undefined);
    return { check: check && check.kind !== 'new' ? check : unknown, edition: undefined };
  }
  // The reader's Edition Line: a kept line of a Followed Series, else any
  // answer for it this device still has (a page asked it online before).
  const anchor = readerLine(edition, library);
  const line = anchor === undefined ? undefined : (lines.get(anchor) ?? (await device.line(anchor)));
  const check = shelfCheck(isbn, edition, library, line);
  return { check: followedLine(edition, library) !== undefined && !line && check.kind !== 'owned' ? unknown : check, edition };
}

// What this device keeps from the Catalog for Shelf Check offline
// (src/lib/catalog/device.ts): the Editions of the Copies and Reading
// Statuses, and the Edition Lines of the Followed Series by anchor ISBN.
export function keptOnDevice(library: Library): { isbns: string[]; anchors: string[] } {
  const isbns = [...library.copies, ...library.readingStatuses].map(({ value }) => value.isbn);
  return { isbns: [...new Set(isbns)], anchors: followedAnchors(library) };
}

// Keeps on this device what Shelf Check needs offline, from every screen that
// reads the Library (loadLibrary), so a book added or a Series followed
// anywhere is kept before the reader goes to a shop. Only what is not kept
// yet is asked (Check a book also asks the Edition Lines again). A call while
// a keep runs waits for it, then keeps the latest Library.
let latest: Library | undefined;
let running: Promise<void> | undefined;
let shared: KeptCatalog | undefined;

export function keepOnDevice(library: Library, catalog: KeptCatalog = (shared ??= deviceCatalog({}))): Promise<void> {
  latest = library;
  return (running ??= (async () => {
    try {
      let next: Library | undefined;
      while ((next = latest)) {
        latest = undefined;
        const { isbns, anchors } = keptOnDevice(next);
        await catalog.keep(isbns, anchors).catch(() => false);
      }
    } finally {
      running = undefined;
    }
  })());
}

// Check a book asks the Catalog only while the browser is online. Offline, or
// when the network fails on the way, the answer comes from this device and
// the ISBN is not kept to be sent later.
export async function catalogAnswer(isbn: string, online: boolean, lookup: (isbn: string) => Promise<Lookup>): Promise<Lookup | { offline: true }> {
  if (!online) return { offline: true };
  try {
    return await lookup(isbn);
  } catch (error) {
    if (isNetworkFailure(error)) return { offline: true };
    throw error;
  }
}

function followedAnchors(library: Library): string[] {
  return [...new Set(library.follows.filter(({ value }) => value.status === 'following').map(({ value }) => value.anchorIsbn))];
}

function followOf(edition: Checked | undefined, library: Library) {
  const series = edition?.series;
  return library.follows.find(({ rkey, value }) => isSeries(series, rkey) && value.status === 'following');
}
