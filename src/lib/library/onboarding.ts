// Series Onboarding (glossary): when a Series first enters the Library, the
// reader says which of its Volumes they own and have read. Pure, like model.ts.
// Only the Volumes the Catalog already knows in the Edition Line take part:
// a Copy needs an ISBN. Onboarding only adds: it never removes a Copy or
// lowers a Reading Status.
import type { Edition } from '../catalog/catalog';
import type { Copy } from './copy';
import type { Follow } from './follow';
import { currentStatus, statusChange, type Library } from './model';
import type { ReadingStatus, Status } from './reading-status';
import type { Saved } from './records';

export interface Onboarding {
  series: { id: string; title: string };
  // The Edition just added: it sets the Edition Line to follow.
  anchor: Edition;
  // The numbered Volumes of the Edition Line, by Volume number.
  volumes: (Edition & { volume: number })[];
  // The values the two steppers move through: 0 (none), then each known Volume number.
  steps: number[];
  start: Choices;
}

export interface Choices {
  // "I own Volumes 1 to N" and "I've read up to N"; 0 is none.
  ownedUpTo: number;
  readUpTo: number;
  // ISBNs of the Volumes the reader tapped: owned is the opposite of the range.
  tapped: ReadonlySet<string>;
  // "Tell me when a new Volume is out".
  follow: boolean;
}

export interface Tile {
  isbn: string;
  volume: number;
  owned: boolean;
  read: boolean;
  // It has a Copy already, so it stays owned whatever the choices.
  kept: boolean;
}

export interface OnboardingSave {
  copies: Copy[];
  readingStatuses: ReadingStatus[];
  // Undefined when the follow record already says the same.
  follow?: Follow;
}

// Why Quick Add does not start the flow, or undefined when it does. `before`
// is the Library before the Copy of `added` was saved: the flow is for a
// Series new in the Library, never followed or dropped.
export type NoOnboarding = 'no-series' | 'in-library' | 'followed' | 'dropped';

export function noOnboarding(added: Edition, volumes: Edition[], before: Library): NoOnboarding | undefined {
  if (!added.series || added.volume === null) return 'no-series';
  const found = seriesRecords(added.series.id, [added, ...volumes], before);
  if (found.follow) return found.follow.value.status === 'dropped' ? 'dropped' : 'followed';
  return found.copies.length > 0 || found.readingStatuses.length > 0 ? 'in-library' : undefined;
}

// The records of one Series in the Library: Copies and Reading Statuses of its
// Volumes (by Work or by ISBN), and its follow.
export function seriesRecords(seriesId: string, volumes: Edition[], library: Library) {
  return {
    copies: library.copies.filter((copy) => volumes.some((each) => copyOf(each, copy))),
    readingStatuses: library.readingStatuses.filter((status) => volumes.some((each) => statusOf(each, status))),
    follow: library.follows.find(({ rkey }) => rkey === seriesId),
  };
}

export function seriesOnboarding(anchor: Edition, volumes: Edition[], library: Library): Onboarding {
  if (!anchor.series) throw new Error(`No Series for ISBN ${anchor.isbn}`);
  // One tile per Volume: a Volume can have several printings in one Edition
  // Line (One Piece 1, 2000 and 2013). The one added, else the printing the
  // reader owns (same ISBN), else the first.
  const owned = new Set(library.copies.map(({ value }) => value.isbn));
  const preferred = (each: Edition) => (each.isbn === anchor.isbn ? 2 : owned.has(each.isbn) ? 1 : 0);
  const byVolume = new Map<number, Edition & { volume: number }>();
  for (const each of volumes) {
    if (each.volume === null) continue;
    const kept = byVolume.get(each.volume);
    if (!kept || preferred(each) > preferred(kept)) byVolume.set(each.volume, { ...each, volume: each.volume });
  }
  const numbered = [...byVolume.values()].sort((a, b) => a.volume - b.volume);
  const highest = (keep: (each: Edition) => boolean) => Math.max(0, ...numbered.filter(keep).map((each) => each.volume));
  return {
    series: anchor.series,
    anchor,
    volumes: numbered,
    steps: [0, ...new Set(numbered.map((each) => each.volume))],
    start: {
      ownedUpTo: highest((each) => hasCopy(each, library)),
      readUpTo: highest((each) => isRead(each, library)),
      tapped: new Set(),
      follow: true,
    },
  };
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

export function volumeTiles(onboarding: Onboarding, library: Library, choices: Choices): Tile[] {
  return onboarding.volumes.map((each) => {
    const kept = hasCopy(each, library);
    const inRange = each.volume <= choices.ownedUpTo;
    return {
      isbn: each.isbn,
      volume: each.volume,
      kept,
      owned: kept || inRange !== choices.tapped.has(each.isbn),
      read: isRead(each, library) || each.volume <= choices.readUpTo,
    };
  });
}

// What Save writes: a Copy for each owned Volume that has none, a Reading
// Status for each read Volume not yet read, and the follow.
export function onboardingSave(onboarding: Onboarding, library: Library, choices: Choices, now: Date): OnboardingSave {
  const tiles = volumeTiles(onboarding, library, choices);
  const edition = (isbn: string) => onboarding.volumes.find((each) => each.isbn === isbn)!;
  const copies = tiles
    .filter(({ owned, kept }) => owned && !kept)
    .map(({ isbn }): Copy => ({ isbn, works: [edition(isbn).work.id], createdAt: now.toISOString() }));
  const readingStatuses = tiles
    .filter(({ read }) => read)
    .flatMap(({ isbn }) => statusChange(edition(isbn).work.id, isbn, 'read', library, now) ?? []);

  const status = choices.follow ? 'following' : 'dropped';
  const current = library.follows.find(({ rkey }) => rkey === onboarding.series.id)?.value;
  const follow: Follow | undefined =
    current?.status === status
      ? undefined
      : { series: onboarding.series.id, anchorIsbn: onboarding.anchor.isbn, status, updatedAt: now.toISOString() };
  return { copies, readingStatuses, ...(follow && { follow }) };
}

// A Series becomes followed when the reader marks one of its Volumes read
// (glossary: Followed Series), in the Edition Line of that Volume. A Series
// followed or dropped already keeps its record: dropping is deliberate.
export function followOnRead(edition: Edition | undefined, chosen: Status, library: Library, now: Date): Follow | undefined {
  const series = edition?.series;
  if (!edition || !series || chosen !== 'read') return undefined;
  if (library.follows.some(({ rkey }) => rkey === series.id)) return undefined;
  return { series: series.id, anchorIsbn: edition.isbn, status: 'following', updatedAt: now.toISOString() };
}

const copyOf = (edition: Edition, { value }: Saved<Copy>) => value.isbn === edition.isbn || value.works.includes(edition.work.id);
const statusOf = (edition: Edition, { rkey, value }: Saved<ReadingStatus>) => rkey === edition.work.id || value.isbn === edition.isbn;

function hasCopy(edition: Edition, library: Library): boolean {
  return library.copies.some((copy) => copyOf(edition, copy));
}

function isRead(edition: Edition, library: Library): boolean {
  return currentStatus(edition.work.id, library) === 'read';
}
