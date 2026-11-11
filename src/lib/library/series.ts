// A Series in the Library (glossary: Followed Series, Dropped Series, Edition
// Line, Missing Volume): where the reader stands in it, the Volumes they
// collect, and the follow record to save when they follow it, switch Edition
// Line or drop it. No Space and no network: the Catalog is asked through
// `CatalogAsk`, so every rule here is tested alone.
import type { Edition } from '../catalog/catalog';
import type { Follow } from './follow';
import { currentStatus, isOwned, type Editions, type Library } from './model';
import type { Status } from './reading-status';

// The Series page of the Series of an Edition: `/series?isbn=<ISBN>`. The page
// shows the Edition Line the reader follows, else the one of this Edition.
export function seriesHref(isbn: string): string {
  return `/series?isbn=${encodeURIComponent(isbn)}`;
}

// The Volumes the Catalog knows in the Edition Line of an ISBN (`/volumes`),
// by that ISBN. An ISBN missing here could not be asked (offline).
export type EditionLines = ReadonlyMap<string, Edition[]>;

// The Volume from which the reader collects the followed Edition Line: 1 when
// they never switched. A `fromVolume` that is not a whole number (written by
// another app) counts as no switch.
function fromVolume(follow: Follow): number {
  const from = Number(follow.fromVolume);
  return Number.isInteger(from) && from > 1 ? from : 1;
}

// The Volumes the reader collects in a Followed Series: after a switch "from
// Volume N", the earlier Edition Line before N and the followed one from N
// on. Undefined when the Catalog could not give the followed Edition Line.
//
// The follow record holds only the new Edition Line (ADR 0010), so the
// earlier one is the line of the reader's Copy of the highest Volume before N.
// No such Copy: the followed line for every Volume. That line not asked yet:
// only the Volumes from N on, so no Edition of the wrong line is suggested.
// `editions` holds the Catalog's Editions of the reader's Copies.
export function collectedVolumes(follow: Follow, library: Library, lines: EditionLines, editions: Editions): Edition[] | undefined {
  const line = lines.get(follow.anchorIsbn);
  if (!line) return undefined;
  const anchor = earlierAnchor(follow, library, line, editions);
  if (anchor === undefined) return line;
  const from = fromVolume(follow);
  const before = (lines.get(anchor) ?? []).filter(({ volume }) => volume !== null && volume < from);
  return [...before, ...line.filter(({ volume }) => volume === null || volume >= from)];
}

// What a screen asks the Catalog for, through `/volumes` and ISBN lookups.
export interface CatalogAsk {
  // Undefined when the Catalog cannot say.
  volumes(isbn: string): Promise<Edition[] | undefined>;
  editions(isbns: string[]): Promise<Map<string, Edition>>;
}

// Fills `lines` and `editions` so collectedVolumes can answer for these
// follows: the followed Edition Lines and, after a switch, the Editions of
// the Copies and the earlier lines. Asks only what is not there yet; a line
// the Catalog cannot give now is asked again on the next call.
export async function askCollected(follows: Follow[], library: Library, lines: Map<string, Edition[]>, editions: Map<string, Edition>, ask: CatalogAsk) {
  const askLines = (isbns: string[]) =>
    Promise.all(
      [...new Set(isbns)]
        .filter((isbn) => !lines.has(isbn))
        .map(async (isbn) => {
          const volumes = await ask.volumes(isbn).catch(() => undefined);
          if (volumes) lines.set(isbn, volumes);
        }),
    );
  await askLines(follows.map(({ anchorIsbn }) => anchorIsbn));
  if (!follows.some((each) => fromVolume(each) > 1)) return;
  const unknown = library.copies.map(({ value }) => value.isbn).filter((isbn) => !editions.has(isbn));
  if (unknown.length > 0) for (const [isbn, edition] of await ask.editions(unknown)) editions.set(isbn, edition);
  await askLines(
    follows.flatMap((each) => {
      const line = lines.get(each.anchorIsbn);
      const anchor = line && earlierAnchor(each, library, line, editions);
      return anchor ? [anchor] : [];
    }),
  );
}

// The ISBN to ask `/volumes` for to get the Edition Line collected before a
// switch, or undefined when there is none (see collectedVolumes).
export function earlierAnchor(follow: Follow, library: Library, line: Edition[], editions: Editions): string | undefined {
  const from = fromVolume(follow);
  if (from === 1) return undefined;
  const inLine = new Set(line.map(({ isbn }) => isbn));
  const before = library.copies
    .flatMap(({ value }) => editions.get(value.isbn) ?? [])
    .filter((each) => each.series?.id === follow.series && each.volume !== null && each.volume < from && !inLine.has(each.isbn))
    .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
  return before[0]?.isbn;
}

// filled = read, outlined = owned not read, dashed grey = not owned. A Volume
// after the latest one owned looks like a Missing Volume; the counts tell them
// apart. New and Upcoming Volumes (cobalt) need release dates the Catalog does
// not have yet.
export type SpineState = 'read' | 'owned' | 'not-owned';

export interface Spine {
  volume: number;
  state: SpineState;
}

export interface SeriesStanding {
  // Volumes, not Copies or printings.
  owned: number;
  read: number;
  missing: Edition[];
  // The first Volume after the latest one owned that the Catalog knows; null when there is none.
  next: number | null;
  spines: Spine[];
}

// Where the reader stands in the Volumes of a Series. A Volume is read when
// the Work of one of its printings is; it can be read and not owned
// (borrowed): then it is filled on the spine row and still missing.
export function seriesStanding(volumes: Edition[], library: Library): SeriesStanding {
  const numbered = byVolume(volumes);
  const owned = numbered.filter(([, printings]) => printings.some((each) => isOwned(each, library))).map(([volume]) => volume);
  const read = numbered
    .filter(([, printings]) => printings.some((each) => currentStatus(each.work.id, library) === 'read'))
    .map(([volume]) => volume);
  const latest = Math.max(0, ...owned);
  return {
    owned: owned.length,
    read: read.length,
    missing: missingVolumes(volumes, library),
    next: numbered.find(([volume]) => volume > latest)?.[0] ?? null,
    spines: numbered.map(([volume]) => ({
      volume,
      state: read.includes(volume) ? 'read' : owned.includes(volume) ? 'owned' : 'not-owned',
    })),
  };
}

// The Missing Volumes (glossary) of a Series: numbered Volumes before the
// latest one the reader owns, of which they own no printing. One Edition per
// Volume, a single Volume before an omnibus; an omnibus that is the only
// printing of two Missing Volumes is listed once. A Volume counts as owned by
// ISBN or by Work (isOwned), so a Copy from another Edition Line of the Series
// counts too.
export function missingVolumes(volumes: Edition[], library: Library): Edition[] {
  const numbered = byVolume(volumes);
  const owned = numbered.filter(([, printings]) => printings.some((each) => isOwned(each, library))).map(([volume]) => volume);
  const latest = Math.max(0, ...owned);
  const missing = numbered.filter(([volume]) => volume < latest && !owned.includes(volume)).map(([, printings]) => printings[0]);
  return [...new Set(missing)];
}

// The printings of each numbered Volume, in Volume order, the ones with the
// fewest Volumes first: an omnibus is a printing of each of its Volumes.
function byVolume(volumes: Edition[]): [number, Edition[]][] {
  const numbered = new Map<number, Edition[]>();
  for (const each of volumes) {
    for (const volume of each.volumes) numbered.set(volume, [...(numbered.get(volume) ?? []), each]);
  }
  for (const printings of numbered.values()) printings.sort((a, b) => a.volumes.length - b.volumes.length);
  return [...numbered].sort(([a], [b]) => a - b);
}

// The follow to save when the reader follows the Series of `edition`, in its
// Edition Line. A dropped Series followed again keeps its Edition Line and
// its switch. Undefined when the Edition is in no Series.
export function followSeries(edition: Edition, current: Follow | undefined, now: Date): Follow | undefined {
  if (!edition.series) return undefined;
  if (current) return { ...current, status: 'following', updatedAt: now.toISOString() };
  return { series: edition.series.id, anchorIsbn: edition.isbn, status: 'following', updatedAt: now.toISOString() };
}

// Dropped Series (glossary): the record stays, with its Edition Line.
export function dropSeries(current: Follow, now: Date): Follow {
  return { ...current, status: 'dropped', updatedAt: now.toISOString() };
}

export type SwitchProblem = 'unknown' | 'other-series' | 'same-line' | 'no-volume';

// The follow to save when the reader collects the Series in the Edition Line
// of `edition` from its Volume on, or why not. `line` is the followed Edition
// Line. From Volume 1, the new line replaces the old one for every Volume.
export function switchLine(current: Follow, edition: Edition | undefined, line: Edition[], now: Date): { follow: Follow } | { problem: SwitchProblem } {
  if (!edition) return { problem: 'unknown' };
  if (edition.series?.id !== current.series) return { problem: 'other-series' };
  if (line.some(({ isbn }) => isbn === edition.isbn)) return { problem: 'same-line' };
  if (edition.volume === null) return { problem: 'no-volume' };
  const follow: Follow = { series: current.series, anchorIsbn: edition.isbn, status: 'following', updatedAt: now.toISOString() };
  if (edition.volume > 1) follow.fromVolume = String(edition.volume);
  return { follow };
}

// Abandoning a Volume of a Followed Series suggests dropping the Series, but
// does not drop it (glossary: Dropped Series).
export function suggestsDrop(edition: Edition | undefined, chosen: Status, library: Library): boolean {
  const series = edition?.series;
  if (!series || chosen !== 'abandoned') return false;
  return library.follows.some(({ rkey, value }) => rkey === series.id && value.status === 'following');
}
