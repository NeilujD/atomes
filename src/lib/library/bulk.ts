// Bulk select (CORE-109): one action on many books of the Library or of a
// Series page. Pure, except `writeAll`: each rule says what to write and what
// puts every record back as it was, for the Undo of its toast.
import type { Correction, Edition, NewSeries } from '../catalog/catalog';
import type { Language } from '../i18n/i18n';
import type { Space, WriteState } from '../space/queued-store';
import { copyCollection, type Copy } from './copy';
import { attach, detach, labelCollection, labelNamed, type Label } from './label';
import { worstState } from './library';
import { isOwned, statusChange, type Library } from './model';
import { readingStatusCollection, type Status } from './reading-status';
import { putRecord, type Saved } from './records';
import { toBuyCollection } from './to-buy';

// A book picked in select mode: its Work, and the Edition a new Reading Status points at.
export interface Picked {
  work: string;
  isbn: string;
}

// One record to write: a put, or a delete when `value` is null.
export interface RecordWrite {
  collection: string;
  rkey: string;
  value: object | null;
}

// What a bulk action writes, and what puts every record back (Undo).
export interface Bulk {
  writes: RecordWrite[];
  undo: RecordWrite[];
}

// Each write goes through the write queue of the store, in order: offline,
// they all wait on this device (ADR 0002). Puts are checked against their lexicon.
export async function writeAll(space: Space, writes: RecordWrite[]): Promise<WriteState> {
  const states: WriteState[] = [];
  for (const { collection, rkey, value } of writes) {
    states.push(value === null ? await space.delete(collection, rkey) : await putRecord(space, collection, rkey, value));
  }
  return worstState(states);
}

// "Owned" on the Series page: a Copy of each picked Edition whose Volume the
// reader does not own in any printing. Like the Copies of Series Onboarding,
// it has no day: the books were got before. As with "I bought it", the
// Edition leaves To Buy when it was put there by hand. Undo deletes the
// Copies and puts those To Buy records back.
export function ownedBulk(picked: Picked[], library: Library, now: Date, newKey: () => string): Bulk {
  const bulk: Bulk = { writes: [], undo: [] };
  for (const { work, isbn } of picked) {
    if (isOwned({ isbn, work: { id: work, title: '' } }, library)) continue;
    const rkey = newKey();
    const copy: Copy = { isbn, works: [work], createdAt: now.toISOString() };
    bulk.writes.push({ collection: copyCollection, rkey, value: copy });
    bulk.undo.push({ collection: copyCollection, rkey, value: null });
    const listed = library.toBuy.find(({ value }) => value.isbn === isbn);
    if (!listed) continue;
    bulk.writes.push({ collection: toBuyCollection, rkey: listed.rkey, value: null });
    bulk.undo.push({ collection: toBuyCollection, rkey: listed.rkey, value: listed.value });
  }
  return bulk;
}

// The Reading Status `status` on every picked Work not at it yet. Undo puts
// back the record each had; a Work with none was unread, and gets none again.
export function statusBulk(picked: Picked[], status: Status, library: Library, now: Date): Bulk {
  const bulk: Bulk = { writes: [], undo: [] };
  for (const { work, isbn } of picked) {
    const change = statusChange(work, isbn, status, library, now, { dated: false });
    if (!change) continue;
    const before = library.readingStatuses.find(({ rkey }) => rkey === work)?.value ?? null;
    bulk.writes.push({ collection: readingStatusCollection, rkey: work, value: change });
    bulk.undo.push({ collection: readingStatusCollection, rkey: work, value: before });
  }
  return bulk;
}

// The Label of the typed name on every Work: the reader's Label of that name
// (labelNamed: "shonen" is "Shōnen"), else a new one under `newKey()`. Undo
// puts the Label back as it was, or deletes the new one.
export function addLabelBulk(typed: string, works: string[], labels: Saved<Label>[], now: Date, language: Language, newKey: () => string): Bulk | { problem: 'empty' } {
  const name = typed.trim();
  if (!name) return { problem: 'empty' };
  const existing = labelNamed(name, labels, language);
  if (existing) return labelChange(existing, works.reduce(attach, existing.value));
  const rkey = newKey();
  return {
    writes: [{ collection: labelCollection, rkey, value: { name, works, createdAt: now.toISOString() } }],
    undo: [{ collection: labelCollection, rkey, value: null }],
  };
}

// The Works come off the Label; it keeps its other Works and its Series.
export function removeLabelBulk(label: Saved<Label>, works: string[]): Bulk {
  return labelChange(label, works.reduce(detach, label.value));
}

function labelChange({ rkey, value }: Saved<Label>, changed: Label): Bulk {
  return { writes: [{ collection: labelCollection, rkey, value: changed }], undo: [{ collection: labelCollection, rkey, value }] };
}

// The Works whose Private state changes when the reader keeps them Private
// (`kept`) or lets them go: Undo turns back exactly these.
export function privacyChange(works: string[], kept: boolean, privateWorks: readonly string[]): string[] {
  return works.filter((work) => privateWorks.includes(work) !== kept);
}

// Where "Move to Series" puts the Editions (ADR 0017): an Edition Line of the
// Catalog, or a New Series.
export type MoveTarget = { anchor: string } | { newSeries: NewSeries };

// One Series Correction per Edition, in order. A known Volume number stays;
// `typed` gives the missing ones (none when left empty). A New Series is made
// once, by the first Edition: the others join its Edition Line.
export function moveCorrections(editions: Edition[], target: MoveTarget, typed: Record<string, number | null>): [string, Correction][] {
  return editions.map(({ isbn, volume }, index) => {
    const number = volume ?? typed[isbn] ?? null;
    if ('anchor' in target) return [isbn, { anchor: target.anchor, volume: number }];
    return [isbn, index === 0 ? { newSeries: target.newSeries, volume: number } : { anchor: editions[0].isbn, volume: number }];
  });
}

// The Editions Undo sends back to the sources: those the move gave their first
// Series Correction. An earlier reader's Correction is not known here, so an
// Edition that had one keeps the new one.
export function moveUndo(editions: Edition[]): string[] {
  return editions.filter(({ corrected }) => !corrected).map(({ isbn }) => isbn);
}
