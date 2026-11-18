// A Series in the Library (glossary: Followed Series, Dropped Series, Edition
// Line, Missing Volume): where the reader stands in it, the Volumes they
// collect, and the follow record to save when they follow it, switch Edition
// Line or drop it. No Space and no network: the Catalog is asked through
// `CatalogAsk`, so every rule here is tested alone.
import type { Edition } from '../catalog/catalog';
import type { Follow } from './follow';
import { isSeries } from './ids';
import { currentStatus, isOwned, type Editions, type Library } from './model';
import type { Status } from './reading-status';

// The Series page of the Series of an Edition: `/series?isbn=<ISBN>`. The page
// shows the Edition Line the reader follows, else the one of this Edition.
// From a Book page (`from: 'book'`), the page marks the Volume of that Book;
// from anywhere else the ISBN only finds the Series, and no Volume is marked.
export function seriesHref(isbn: string, from?: 'book'): string {
  return `/series?isbn=${encodeURIComponent(isbn)}${from ? `&from=${from}` : ''}`;
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
    .filter((each) => isSeries(each.series, follow.series) && each.volume !== null && each.volume < from && !inLine.has(each.isbn))
    .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
  return before[0]?.isbn;
}

// filled = owned and read, outlined on a grey fill = owned not read, outlined with the read
// mark = read not owned (borrowed, given away), dashed grey = not owned. A
// Volume after the latest one owned looks like a Missing Volume; the counts
// tell them apart. New and Upcoming Volumes (cobalt) need release dates the
// Catalog does not have yet.
export type SpineState = 'read' | 'owned' | 'read-not-owned' | 'not-owned';

export interface Spine {
  volume: number;
  state: SpineState;
  // The printing the reader owns, else the one they read, else its single
  // printing before an omnibus: what the Volume sheet shows and saves.
  edition: Edition;
}

export interface SeriesStanding {
  // Volumes, not Copies or printings.
  owned: number;
  read: number;
  missing: Edition[];
  // Whole numbers before the latest Volume owned that the Catalog has no
  // Edition of: not missing (no ISBN to buy), shown apart.
  unknown: number[];
  spines: Spine[];
}

// Where the reader stands in the Volumes of a Series. A Volume is read when
// the Work of one of its printings is; it can be read and not owned
// (borrowed): then it is not missing (glossary: Missing Volume).
export function seriesStanding(volumes: Edition[], library: Library): SeriesStanding {
  const numbered = byVolume(volumes);
  const { owned, read } = ownedAndRead(numbered, library);
  return {
    owned: owned.length,
    read: read.length,
    missing: missingVolumes(volumes, library),
    unknown: unknownVolumes(numbered, owned),
    spines: numbered.map(([volume, printings]) => ({
      volume,
      state: spineState(owned.includes(volume), read.includes(volume)),
      edition:
        printings.find((each) => isOwned(each, library)) ??
        printings.find((each) => currentStatus(each.work.id, library) === 'read') ??
        printings[0],
    })),
  };
}

// One entry of the Missing list on the Series page: a run of Missing Volumes
// ("1–12"), or one number the Catalog has no Edition of.
export interface MissingRange {
  first: number;
  last: number;
  unknown: boolean;
}

// The Missing list in Volume order: runs of Missing Volumes, and apart each
// number the Catalog lacks (each has its own sheet), which cuts a run.
export function missingRanges({ missing, unknown }: Pick<SeriesStanding, 'missing' | 'unknown'>): MissingRange[] {
  const known = missing.flatMap(({ volume }) => (volume === null ? [] : [{ volume, unknown: false }]));
  const listed = [...known, ...unknown.map((volume) => ({ volume, unknown: true }))].sort((a, b) => a.volume - b.volume);
  const ranges: MissingRange[] = [];
  for (const { volume, unknown: lacking } of listed) {
    const run = ranges.at(-1);
    if (run && !run.unknown && !lacking && run.last === volume - 1) run.last = volume;
    else ranges.push({ first: volume, last: volume, unknown: lacking });
  }
  return ranges;
}

// As Series Onboarding: a number from 1000 is likely a year read as a Volume,
// so it ends no range of gaps.
function unknownVolumes(numbered: [number, Edition[]][], owned: number[]): number[] {
  const latest = Math.max(0, ...owned.filter((volume) => volume < 1000));
  const known = new Set(numbered.map(([volume]) => volume));
  return Array.from({ length: Math.ceil(latest) - 1 }, (_, index) => index + 1).filter((volume) => !known.has(volume));
}

export function spineState(owned: boolean, read: boolean): SpineState {
  if (owned) return read ? 'read' : 'owned';
  return read ? 'read-not-owned' : 'not-owned';
}

// The numbers of the Volumes owned (a printing is, isOwned) and read (the Work
// of a printing is).
function ownedAndRead(numbered: [number, Edition[]][], library: Library): { owned: number[]; read: number[] } {
  const having = (rule: (printing: Edition) => boolean) => numbered.filter(([, printings]) => printings.some(rule)).map(([volume]) => volume);
  return { owned: having((each) => isOwned(each, library)), read: having((each) => currentStatus(each.work.id, library) === 'read') };
}

// Series cover rule, shared by the Series page and the Library Series mode:
// the cover of Volume 1, else of the lowest Volume with a cover, else Volume 1
// (the lowest Volume), which shows the default cover. A printing with a cover
// wins, an omnibus too. Undefined when there is no Edition.
export function seriesCover<Volume extends Edition>(volumes: Volume[]): Volume | undefined {
  const printings = byVolume(volumes).flatMap(([, each]) => each);
  return printings.find(({ cover }) => cover) ?? printings[0] ?? volumes[0];
}

// The cover of the Series page: the printing the reader owns of the highest
// Volume they own, cover or not. Undefined when they own none (the page then
// uses seriesCover). Library Series mode keeps seriesCover.
export function latestOwned(volumes: Edition[], library: Library): Edition | undefined {
  return byVolume(volumes)
    .flatMap(([, printings]) => printings.filter((each) => isOwned(each, library)).slice(0, 1))
    .at(-1);
}

// The Missing Volumes (glossary) of a Series: numbered Volumes before the
// latest one the reader owns, of which they own no printing and read none
// (a Volume read and not owned is not missing). One Edition per
// Volume, a single Volume before an omnibus; an omnibus that is the only
// printing of two Missing Volumes is listed once. A Volume counts as owned by
// ISBN or by Work (isOwned), so a Copy from another Edition Line of the Series
// counts too.
export function missingVolumes(volumes: Edition[], library: Library): Edition[] {
  return notOwnedNorRead(volumes, library, true);
}

// The numbered Volumes of an Edition Line that the reader does not own and has
// not read (To Buy): the Missing Volumes and every Volume after the latest one
// owned. A Volume read and not owned goes on To Buy only by hand. A
// Volume the Catalog lists counts as in shops: it has no release dates yet.
// One Edition per Volume, as for missingVolumes.
export function notOwnedVolumes(volumes: Edition[], library: Library): Edition[] {
  return notOwnedNorRead(volumes, library, false);
}

function notOwnedNorRead(volumes: Edition[], library: Library, beforeLatest: boolean): Edition[] {
  const numbered = byVolume(volumes);
  const { owned, read } = ownedAndRead(numbered, library);
  const latest = beforeLatest ? Math.max(0, ...owned) : Infinity;
  const listed = numbered.filter(([volume]) => volume < latest && !owned.includes(volume) && !read.includes(volume)).map(([, printings]) => printings[0]);
  return [...new Set(listed)];
}

// The printings of each numbered Volume, in Volume order, the ones with the
// fewest Volumes first: an omnibus is a printing of each of its Volumes.
function byVolume<Volume extends Edition>(volumes: Volume[]): [number, Volume[]][] {
  const numbered = new Map<number, Volume[]>();
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
  if (!isSeries(edition.series, current.series)) return { problem: 'other-series' };
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
  return library.follows.some(({ rkey, value }) => isSeries(series, rkey) && value.status === 'following');
}
