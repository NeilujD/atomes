// The marks of Search (CORE-185), from the Library on this device: the
// Shelf Check answer of a Work row, and of an exact Edition. In a shop where
// the reader cannot tell which Edition they hold, the Work mark comes first.
import { currentStatus, ownsWork, type Library } from './model';
import type { Status } from './reading-status';

// What Search needs to mark its rows: the Library, and the ISBNs on To Buy
// (hand-added and computed: toBuyList).
export interface SearchMarks {
  library: Library;
  toBuy: ReadonlySet<string>;
}

// owned: a Copy of the Work, in any Edition. read: a Reading Status other
// than unread, and no Copy (the `read` answer of Shelf Check).
export type WorkMark = { kind: 'owned' } | { kind: 'read'; status: Status };

// `ids`: the identifier of the Work and its other ones (WorkResult `also`).
export function workMark(ids: string[], { library }: SearchMarks): WorkMark | undefined {
  if (ids.some((id) => ownsWork(id, library))) return { kind: 'owned' };
  const status = ids.map((id) => currentStatus(id, library)).find((each) => each !== 'unread');
  return status ? { kind: 'read', status } : undefined;
}

export type EditionMark = 'owned' | 'to-buy';

export function editionMark(isbn: string, { library, toBuy }: SearchMarks): EditionMark | undefined {
  if (library.copies.some(({ value }) => value.isbn === isbn)) return 'owned';
  return toBuy.has(isbn) ? 'to-buy' : undefined;
}
