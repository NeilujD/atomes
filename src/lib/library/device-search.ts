// Search with no network (CORE-191, ADR 0021 amendment of 2026-11-24): the
// typed words are looked for in the book data this device keeps for Shelf
// Check offline (keptOnDevice): the Editions of the Library, the Volumes of
// the Edition Lines of the Followed Series, and what the reader typed for a
// Copy no book source knows. Nothing is asked and no word leaves the device.
// Matching is literal: no aliases, so "10" does not find "Dix".
import type { Edition } from '../catalog/catalog';
import type { DeviceCatalog } from '../catalog/device';
import type { EditionResult } from '../catalog/search';
import { fold } from './browse';
import type { Library } from './model';
import { keptOnDevice } from './shelf-check';

// An Edition as Search lists it, and its folded text: title, Volume title,
// Series title and authors.
export interface DeviceBook {
  edition: EditionResult;
  searched: string;
}

export async function deviceBooks(library: Library, device: Pick<DeviceCatalog, 'edition' | 'line'>): Promise<DeviceBook[]> {
  const { isbns, anchors } = keptOnDevice(library);
  const books = new Map<string, DeviceBook>();
  const add = (edition: Edition) => books.set(edition.isbn, fromEdition(edition));
  for (const edition of await Promise.all(isbns.map((isbn) => device.edition(isbn)))) if (edition) add(edition);
  // After the Editions: the line's copy of a Volume is the newer one (deviceShelfCheck).
  for (const line of await Promise.all(anchors.map((anchor) => device.line(anchor)))) line?.forEach(add);
  for (const { value } of library.copies) {
    const details = value.details;
    if (!details || books.has(value.isbn)) continue;
    books.set(value.isbn, {
      edition: { isbn: value.isbn, title: details.title, year: null, publisher: null, collection: null, language: null },
      searched: searched([details.title, details.series, details.volume, ...(details.authors ?? [])]),
    });
  }
  return [...books.values()];
}

// The books that hold every typed word, by title, then Volume.
export function matchOnDevice(words: string, books: DeviceBook[], compare: (a: string, b: string) => number): EditionResult[] {
  const wanted = fold(words).split(/\s+/).filter(Boolean);
  if (wanted.length === 0) return [];
  return books
    .filter(({ searched }) => wanted.every((word) => searched.includes(word)))
    .map(({ edition }) => edition)
    .sort((a, b) => compare(a.title, b.title) || (a.volume ?? 0) - (b.volume ?? 0));
}

function fromEdition(edition: Edition): DeviceBook {
  return {
    edition: {
      isbn: edition.isbn,
      title: edition.title,
      year: edition.year ?? null,
      publisher: edition.publisher,
      collection: null,
      language: edition.language,
      volume: edition.volume,
      volumeTitle: edition.volumeTitle,
    },
    searched: searched([edition.title, edition.volumeTitle, edition.series?.title, ...edition.authors]),
  };
}

const searched = (texts: (string | null | undefined)[]) => fold(texts.filter(Boolean).join(' '));
