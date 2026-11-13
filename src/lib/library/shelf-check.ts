// Shelf Check (glossary): whether the reader owns a book, has read it, or is
// missing it from a Followed Series. Pure, so the online answer of Check a
// book and the offline one (CORE-37) are the same rule.
import type { Edition, Lookup, Series } from '../catalog/catalog';
import { deviceCatalog, type DeviceCatalog, type KeptCatalog } from '../catalog/device';
import { isNetworkFailure } from '../network';
import { editionWork, isSeries } from './ids';
import { currentStatus, isOwned, type Library } from './model';
import type { Status } from './reading-status';
import { missingVolumes, seriesStanding, type Spine } from './series';

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
  // Missing only: the spine row of the Edition Line.
  spines?: Spine[];
}

// What a Shelf Check needs of an Edition.
type Checked = Pick<Edition, 'work' | 'series' | 'volumes'>;

const unknown: ShelfCheck = { kind: 'unknown', status: 'unread', followed: null };

// The anchor ISBN of the Followed Series of `edition`, to ask the Catalog for
// its Edition Line (`/volumes`); undefined when the Series is not followed.
export function followedLine(edition: Checked | undefined, library: Library): string | undefined {
  return followOf(edition, library)?.value.anchorIsbn;
}

// `edition`: the Catalog's Edition of `isbn`, undefined when no source knows
// it (its Work is then `isbn:<isbn>`, ADR 0010). `line`: the Edition Line of
// the Followed Series (followedLine), undefined when it could not be asked:
// the book is then never called missing.
export function shelfCheck(isbn: string, edition: Checked | undefined, library: Library, line: Edition[] | undefined): ShelfCheck {
  const work = edition?.work.id ?? editionWork(isbn);
  const status = currentStatus(work, library);
  const followed = followOf(edition, library) ? (edition?.series ?? null) : null;
  const volumes = edition?.volumes ?? [];
  const missing = line !== undefined && missingVolumes(line, library).some((each) => each.volumes.some((n) => volumes.includes(n)));
  if (isOwned({ isbn, work: { id: work, title: '' } }, library)) return { kind: 'owned', status, followed };
  if (line && missing && followed) return { kind: 'missing', status, followed, spines: seriesStanding(line, library).spines };
  return { kind: status !== 'unread' ? 'read' : 'new', status, followed };
}

// The Shelf Check with no network: from the Library on this device and the
// Catalog data it keeps (keptOnDevice), never asking anything. The Edition is
// its Volume in a kept Edition Line of a Followed Series, else the kept answer
// for the ISBN: an Edition is kept once, a line is asked again as it grows, so
// the line's copy is the newer one. When the device lacks what the answer
// needs, it is `unknown`: a book it does not know, or a Volume of a Followed
// Series whose Edition Line it does not have (it could be missing).
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
  const anchor = followedLine(edition, library);
  const line = anchor === undefined ? undefined : lines.get(anchor);
  const check = shelfCheck(isbn, edition, library, line);
  return { check: anchor !== undefined && !line && check.kind !== 'owned' ? unknown : check, edition };
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
