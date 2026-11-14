// Series Onboarding (glossary): when a Series first enters the Library, the
// reader says which of its Volumes they own and have read. Pure, like model.ts.
// There is a tile for every number from 1 to the highest known Volume, but
// only the Volumes the Catalog already knows in the Edition Line get records:
// a Copy and a Reading Status need an ISBN (ADR 0010). Onboarding only adds:
// it never removes a Copy or lowers a Reading Status.
import type { Edition } from '../catalog/catalog';
import type { Copy } from './copy';
import type { Follow } from './follow';
import { isSeries } from './ids';
import { currentStatus, isOwned, statusChange, type Library } from './model';
import type { ReadingStatus, Status } from './reading-status';
import type { Saved } from './records';

export interface Onboarding {
  series: { id: string; title: string };
  // The Edition just added: it sets the Edition Line to follow.
  anchor: Edition;
  // One Edition per numbered Volume of the Edition Line, by Volume number; `volume`
  // is that Volume, also for an omnibus, which is there once for each of its Volumes.
  volumes: (Edition & { volume: number })[];
  // The values the two steppers move through: 0 (none), then each tile number.
  steps: number[];
  start: Choices;
  // When the added Volume is not the first: "Do you own Volumes 1–upTo?", asked
  // before the tiles. Undefined when the reader owns them all already.
  ask?: { upTo: number };
}

export interface Choices {
  // "I own Volumes 1 to N" and "I've read up to N"; 0 is none.
  ownedUpTo: number;
  readUpTo: number;
  // What the reader tapped, by ISBN: owned or not, whatever the range. A tap
  // stays when the range moves: the gaps the reader made stay gaps.
  tapped: ReadonlyMap<string, boolean>;
  // The same for read: "read 1 and 3, not 2". The read range reads owned
  // Volumes only; a tap can mark a Volume read and not owned (borrowed).
  readTapped: ReadonlyMap<string, boolean>;
  // "Tell me when a new Volume is out".
  follow: boolean;
}

// What a tap or a range marks: "Tapping marks: Owned | Read".
export type TapMode = 'owned' | 'read';

export interface Tile {
  // Null: the Catalog knows no Edition of this number. The tile cannot change.
  isbn: string | null;
  volume: number;
  owned: boolean;
  read: boolean;
  // It has a Copy already, so it stays owned whatever the choices.
  kept: boolean;
  // It is read already, so it stays read whatever the choices.
  keptRead: boolean;
}

export interface OnboardingSave {
  copies: Copy[];
  readingStatuses: ReadingStatus[];
  // Undefined when the follow record already says the same.
  follow?: Follow;
}

// Why Quick Add does not start the flow, or undefined when it does. `before`
// is the Library before the Copy of `added` was saved: the flow is for a
// Series with no follow record (following or dropped) under any of its
// identifiers. Its Volumes already in the Library show as kept in the flow.
export type NoOnboarding = 'no-series' | 'followed' | 'dropped';

export function noOnboarding(added: Edition, before: Library): NoOnboarding | undefined {
  const series = added.series;
  if (!series || added.volume === null) return 'no-series';
  const follow = before.follows.find(({ rkey }) => isSeries(series, rkey));
  if (follow) return follow.value.status === 'dropped' ? 'dropped' : 'followed';
  return undefined;
}

// The records of one Series in the Library: Copies and Reading Statuses of its
// Volumes (by Work or by ISBN), and its follow, under any identifier of the Series.
export function seriesRecords(series: NonNullable<Edition['series']>, volumes: Edition[], library: Library) {
  return {
    copies: library.copies.filter((copy) => volumes.some((each) => copyOf(each, copy))),
    readingStatuses: library.readingStatuses.filter((status) => volumes.some((each) => statusOf(each, status))),
    follow: library.follows.find(({ rkey }) => isSeries(series, rkey)),
  };
}

export function seriesOnboarding(anchor: Edition, volumes: Edition[], library: Library): Onboarding {
  if (!anchor.series) throw new Error(`No Series for ISBN ${anchor.isbn}`);
  // One tile per Volume: a Volume can have several printings in one Edition
  // Line (One Piece 1, 2000 and 2013, or an omnibus of Volumes 1 and 2). The
  // one added, else the printing the reader owns (same ISBN), else the one
  // with the fewest Volumes, else the first.
  const owned = new Set(library.copies.map(({ value }) => value.isbn));
  const preferred = (each: Edition) => (each.isbn === anchor.isbn ? 2 : owned.has(each.isbn) ? 1 : 0);
  const better = (each: Edition, kept: Edition) =>
    preferred(each) - preferred(kept) || kept.volumes.length - each.volumes.length;
  const byVolume = new Map<number, Edition & { volume: number }>();
  for (const each of volumes) {
    for (const volume of each.volumes) {
      const kept = byVolume.get(volume);
      if (!kept || better(each, kept) > 0) byVolume.set(volume, { ...each, volume });
    }
  }
  const numbered = [...byVolume.values()].sort((a, b) => a.volume - b.volume);
  // Every whole number up to the highest known Volume, and the known ones (5.5).
  // A number from 1000 is likely a year read as a Volume: it fills no gap.
  const last = Math.max(0, ...numbered.filter(({ volume }) => volume < 1000).map(({ volume }) => volume));
  const numbers = new Set([...Array.from({ length: Math.floor(last) }, (_, index) => index + 1), ...byVolume.keys()]);
  const steps = [0, ...[...numbers].sort((a, b) => a - b)];
  // The range starts where the Library says, from Volume 1 with no gap: never
  // from the highest Volume owned, which would tick Volumes the reader may not have.
  const fromOne = (keep: (each: Edition) => boolean) => {
    const gap = steps.slice(1).findIndex((n) => {
      const each = byVolume.get(n);
      return !each || !keep(each);
    });
    return gap === -1 ? steps.at(-1)! : steps[gap];
  };
  const ownedUpTo = fromOne((each) => isOwned(each, library));
  const before = steps.findLast((n) => n < Math.min(...anchor.volumes)) ?? 0;
  return {
    series: anchor.series,
    anchor,
    volumes: numbered,
    steps,
    start: {
      ownedUpTo,
      readUpTo: fromOne((each) => isRead(each, library)),
      tapped: new Map(),
      readTapped: new Map(),
      follow: true,
    },
    ...(before > ownedUpTo && { ask: { upTo: before } }),
  };
}

// The answer to "Do you own Volumes 1–N?": Yes ticks them; Some (the reader
// taps them) and No tick nothing.
export type Answer = 'yes' | 'some' | 'no';

export function answer(onboarding: Onboarding, choices: Choices, said: Answer): Choices {
  return said === 'yes' && onboarding.ask ? { ...choices, ownedUpTo: Math.max(choices.ownedUpTo, onboarding.ask.upTo) } : choices;
}

// The next stepper value up (+1) or down (-1); it stays at either end.
// `value` can be any number the reader typed, not only a known Volume.
export function step(steps: number[], value: number, by: 1 | -1): number {
  const next = by === 1 ? steps.find((each) => each > value) : steps.findLast((each) => each < value);
  return next ?? (by === 1 ? steps.at(-1)! : steps[0]);
}

// What the reader typed in a range field, kept between none and the last
// known Volume; undefined while it is not a number. A Volume the Catalog does
// not know still bounds the range: "1 to 13" when 13 is unknown.
export function typedVolume(steps: number[], typed: string): number | undefined {
  const value = Number(typed.trim().replace(',', '.'));
  if (typed.trim() === '' || !Number.isFinite(value)) return undefined;
  return Math.min(steps.at(-1)!, Math.max(0, value));
}

// A new value for one range. The taps stay.
export function withRange(choices: Choices, mode: TapMode, value: number): Choices {
  return mode === 'owned' ? { ...choices, ownedUpTo: value } : { ...choices, readUpTo: value };
}

// A tap on a tile: owned or read becomes the opposite of what it shows. A tap
// back to what the range says is no tap: the tile follows the range again.
export function tapTile(onboarding: Onboarding, library: Library, choices: Choices, mode: TapMode, isbn: string): Choices {
  const key = mode === 'owned' ? 'tapped' : 'readTapped';
  const tile = volumeTiles(onboarding, library, choices).find((each) => each.isbn === isbn);
  if (!tile) return choices;
  const shown = mode === 'owned' ? tile.owned : tile.read;
  const tapped = new Map(choices[key]);
  if (!shown === inRange(tile, choices, mode)) tapped.delete(isbn);
  else tapped.set(isbn, !shown);
  return { ...choices, [key]: tapped };
}

// "Same as owned": read is what owned is, Volume by Volume, gaps too.
export function sameAsOwned(onboarding: Onboarding, library: Library, choices: Choices): Choices {
  const owned = volumeTiles(onboarding, library, choices).filter((tile) => tile.owned);
  return { ...choices, readUpTo: Math.max(0, ...owned.map(({ volume }) => volume)), readTapped: new Map() };
}

export function volumeTiles(onboarding: Onboarding, library: Library, choices: Choices): Tile[] {
  return onboarding.steps.slice(1).map((volume) => {
    const each = onboarding.volumes.find((known) => known.volume === volume);
    if (!each) return { isbn: null, volume, owned: false, read: false, kept: false, keptRead: false };
    const kept = isOwned(each, library);
    const keptRead = isRead(each, library);
    const owned = kept || (choices.tapped.get(each.isbn) ?? inRange({ volume, owned: false }, choices, 'owned'));
    const read = keptRead || (choices.readTapped.get(each.isbn) ?? inRange({ volume, owned }, choices, 'read'));
    return { isbn: each.isbn, volume, kept, keptRead, owned, read };
  });
}

// What the range alone says of a tile. Read is capped at owned.
function inRange({ volume, owned }: Pick<Tile, 'volume' | 'owned'>, choices: Choices, mode: TapMode): boolean {
  return mode === 'owned' ? volume <= choices.ownedUpTo : owned && volume <= choices.readUpTo;
}

// What Save writes: a Copy for each owned Volume that has none, a Reading
// Status for each read Volume not yet read, and the follow. An omnibus has
// several tiles and gets one Copy and one Reading Status.
export function onboardingSave(onboarding: Onboarding, library: Library, choices: Choices, now: Date): OnboardingSave {
  const tiles = volumeTiles(onboarding, library, choices);
  const edition = (isbn: string) => onboarding.volumes.find((each) => each.isbn === isbn)!;
  const isbnsOf = (keep: (tile: Tile) => boolean) => [
    ...new Set(tiles.filter(keep).flatMap(({ isbn }) => (isbn === null ? [] : [isbn]))),
  ];
  const copies = isbnsOf(({ owned, kept }) => owned && !kept).map(
    (isbn): Copy => ({ isbn, works: [edition(isbn).work.id], createdAt: now.toISOString() }),
  );
  const readingStatuses = isbnsOf(({ read }) => read).flatMap((isbn) => statusChange(edition(isbn).work.id, isbn, 'read', library, now) ?? []);

  const status = choices.follow ? 'following' : 'dropped';
  // A follow saved under an older identifier of the Series keeps its record key (ADR 0010).
  const current = library.follows.find(({ rkey }) => isSeries(onboarding.series, rkey));
  const follow: Follow | undefined =
    current?.value.status === status
      ? undefined
      : { series: current?.rkey ?? onboarding.series.id, anchorIsbn: onboarding.anchor.isbn, status, updatedAt: now.toISOString() };
  return { copies, readingStatuses, ...(follow && { follow }) };
}

// A Series becomes followed when the reader marks one of its Volumes read
// (glossary: Followed Series), in the Edition Line of that Volume. A Series
// followed or dropped already keeps its record: dropping is deliberate.
export function followOnRead(edition: Edition | undefined, chosen: Status, library: Library, now: Date): Follow | undefined {
  const series = edition?.series;
  if (!edition || !series || chosen !== 'read') return undefined;
  if (library.follows.some(({ rkey }) => isSeries(series, rkey))) return undefined;
  return { series: series.id, anchorIsbn: edition.isbn, status: 'following', updatedAt: now.toISOString() };
}

const copyOf = (edition: Edition, { value }: Saved<Copy>) => value.isbn === edition.isbn || value.works.includes(edition.work.id);
const statusOf = (edition: Edition, { rkey, value }: Saved<ReadingStatus>) => rkey === edition.work.id || value.isbn === edition.isbn;

function isRead(edition: Edition, library: Library): boolean {
  return currentStatus(edition.work.id, library) === 'read';
}
