// Shelf Check (glossary): whether the reader owns a book, has read it, or is
// missing it from a Followed Series. Pure, so the online answer of Check a
// book and the offline one (CORE-37) are the same rule.
import type { Edition, Series } from '../catalog/catalog';
import { editionWork, isSeries } from './ids';
import { currentStatus, isOwned, type Library } from './model';
import type { Status } from './reading-status';
import { missingVolumes } from './series';

// owned: a Copy of the Edition or of its Work. missing: a Missing Volume of a
// Followed Series. read: a Reading Status other than unread, and no Copy
// (borrowed, library, ebook). new: none of these.
export type ShelfCheckKind = 'owned' | 'missing' | 'read' | 'new';

export interface ShelfCheck {
  kind: ShelfCheckKind;
  // The Reading Status of the Work; unread when it has none.
  status: Status;
  // The Followed Series the book is a Volume of, if any.
  followed: Series | null;
}

// The anchor ISBN of the Followed Series of `edition`, to ask the Catalog for
// its Edition Line (`/volumes`); undefined when the Series is not followed.
export function followedLine(edition: Edition | undefined, library: Library): string | undefined {
  return followOf(edition, library)?.value.anchorIsbn;
}

// `edition`: the Catalog's Edition of `isbn`, undefined when no source knows
// it (its Work is then `isbn:<isbn>`, ADR 0010). `line`: the Edition Line of
// the Followed Series (followedLine), undefined when it could not be asked:
// the book is then never called missing.
export function shelfCheck(isbn: string, edition: Edition | undefined, library: Library, line: Edition[] | undefined): ShelfCheck {
  const work = edition?.work.id ?? editionWork(isbn);
  const status = currentStatus(work, library);
  const followed = followOf(edition, library) ? (edition?.series ?? null) : null;
  const volumes = edition?.volumes ?? [];
  const missing = line !== undefined && missingVolumes(line, library).some((each) => each.volumes.some((n) => volumes.includes(n)));
  const kind: ShelfCheckKind = isOwned({ isbn, work: { id: work, title: '' } }, library)
    ? 'owned'
    : missing && followed
      ? 'missing'
      : status !== 'unread'
        ? 'read'
        : 'new';
  return { kind, status, followed };
}

function followOf(edition: Edition | undefined, library: Library) {
  const series = edition?.series;
  return library.follows.find(({ rkey, value }) => isSeries(series, rkey) && value.status === 'following');
}
