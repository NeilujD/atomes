import { describe, expect, test } from 'vitest';
import type { Edition } from '../catalog/catalog';
import { libraryBooks } from './browse';
import type { Copy } from './copy';
import { ownedUnread, readingNow, yearCard } from './home';
import type { Library } from './model';
import type { ReadingStatus, Status } from './reading-status';
import type { Saved } from './records';
import { statistics } from './stats';

const edition = (isbn: string, title: string): Edition => ({
  isbn,
  title,
  volumeTitle: null,
  authors: [],
  publisher: null,
  language: null,
  format: null,
  cover: null,
  work: { id: `wd:Q${isbn.slice(-6)}`, title },
  series: null,
  volumes: [],
  volume: null,
  sources: ['BnF'],
  fetchedAt: '2026-11-01T00:00:00.000Z',
});
const dune = edition('9782266320481', 'Dune');
const horde = edition('9782070464234', 'La Horde du Contrevent');
const fondation = edition('9782070360536', 'Fondation');
const asterix = edition('9782864976165', 'Astérix');
const editions = new Map([dune, horde, fondation, asterix].map((each) => [each.isbn, each]));

const copy = (each: Edition, createdAt: string, works = [each.work.id]): Saved<Copy> => ({ rkey: each.isbn, value: { isbn: each.isbn, works, createdAt } });
const status = (each: Edition, value: Status, updatedAt = '2026-11-05T00:00:00.000Z'): Saved<ReadingStatus> => ({
  rkey: each.work.id,
  value: { work: each.work.id, isbn: each.isbn, status: value, updatedAt },
});
const library = (change: Partial<Library>): Library => ({ copies: [], readingStatuses: [], follows: [], loans: [], toBuy: [], ...change });
const titles = (each: { title: string }[]) => each.map(({ title }) => title);

function home(records: Library) {
  const books = libraryBooks(records, editions, []);
  return { ownedUnread: titles(ownedUnread(books, 'en')), readingNow: titles(readingNow(books, records, 'en')) };
}

describe('Owned-Unread', () => {
  test('the Works the reader owns and has not read, the last added first', () => {
    const records = library({
      copies: [copy(dune, '2026-11-01T00:00:00.000Z'), copy(asterix, '2026-11-03T00:00:00.000Z'), copy(horde, '2026-11-02T00:00:00.000Z')],
    });

    expect(home(records).ownedUnread).toEqual(['Astérix', 'La Horde du Contrevent', 'Dune']);
  });

  test('a Work read, being read or abandoned is not Owned-Unread', () => {
    const records = library({
      copies: [copy(dune, '2026-11-01T00:00:00.000Z'), copy(horde, '2026-11-02T00:00:00.000Z'), copy(asterix, '2026-11-03T00:00:00.000Z')],
      readingStatuses: [status(dune, 'read'), status(horde, 'reading'), status(asterix, 'abandoned')],
    });

    expect(home(records).ownedUnread).toEqual([]);
  });

  test('a Work with a Reading Status and no Copy is not owned, so not Owned-Unread', () => {
    expect(home(library({ readingStatuses: [status(fondation, 'unread')] })).ownedUnread).toEqual([]);
  });

  test('a Copy saved before the Catalog knew its Work makes the Work of its Reading Status owned', () => {
    const records = library({ copies: [copy(dune, '2026-11-01T00:00:00.000Z', [`isbn:${dune.isbn}`])], readingStatuses: [status(dune, 'unread')] });

    expect(home(records).ownedUnread).toContain('Dune');
  });

  test('added the same day: A to Z', () => {
    const records = library({ copies: [copy(horde, '2026-11-01T00:00:00.000Z'), copy(asterix, '2026-11-01T00:00:00.000Z')] });

    expect(home(records).ownedUnread).toEqual(['Astérix', 'La Horde du Contrevent']);
  });
});

describe('Reading now', () => {
  test('the Works being read, owned or not, the last started first', () => {
    const records = library({
      copies: [copy(dune, '2026-11-01T00:00:00.000Z'), copy(horde, '2026-11-02T00:00:00.000Z')],
      readingStatuses: [status(dune, 'reading', '2026-11-06T00:00:00.000Z'), status(horde, 'read'), status(fondation, 'reading', '2026-11-08T00:00:00.000Z')],
    });

    expect(home(records).readingNow).toEqual(['Fondation', 'Dune']);
  });

  test('"started" is the start day when the record has one, else the last change (ADR 0019)', () => {
    const startedEarly = status(fondation, 'reading', '2026-11-08T00:00:00.000Z');
    startedEarly.value.startedAt = '2026-10-01T00:00:00.000Z';
    const records = library({ readingStatuses: [status(dune, 'reading', '2026-11-06T00:00:00.000Z'), startedEarly] });

    expect(home(records).readingNow).toEqual(['Dune', 'Fondation']);
  });
});

describe('The card of the year', () => {
  // 18 November 2026 on the reader's device.
  const today = new Date(2026, 10, 18, 9, 30);
  const read = (each: Edition, finishedAt?: string): Saved<ReadingStatus> => {
    const saved = status(each, 'read');
    return finishedAt ? { ...saved, value: { ...saved.value, finishedAt } } : saved;
  };
  const got = (each: Edition, acquiredAt?: string): Saved<Copy> => {
    const saved = copy(each, '2026-11-01T00:00:00.000Z');
    return acquiredAt ? { ...saved, value: { ...saved.value, acquiredAt } } : saved;
  };

  test('"read" and "added" of the current year: the numbers of the Statistics screen for that year, with no filter', () => {
    const records = library({
      // Read in 2026 twice, in 2025, and with no day; got in 2026, in 2025, and with no day.
      readingStatuses: [read(dune, '2026-03-02T00:00:00.000Z'), read(horde, '2026-11-18T00:00:00.000Z'), read(fondation, '2025-12-31T00:00:00.000Z'), read(asterix)],
      copies: [got(dune, '2026-01-05T00:00:00.000Z'), got(horde, '2025-06-01T00:00:00.000Z'), got(asterix)],
    });

    const card = yearCard(records, editions, today, 'en');

    expect(card).toEqual({ year: 2026, read: 2, added: 1 });
    const screen = statistics({ library: records, editions, labels: [], query: { period: 2026, label: null, ownedOnly: false }, language: 'en', today });
    expect({ read: screen.read, added: screen.added }).toEqual({ read: 2, added: 1 });
  });

  test('a Library with no read and no Copy has no card', () => {
    expect(yearCard(library({}), editions, today, 'en')).toBeNull();
    expect(yearCard(library({ readingStatuses: [status(dune, 'reading')] }), editions, today, 'en')).toBeNull();
  });

  test('a read or a Copy with no day in the year still shows the card, at zero', () => {
    expect(yearCard(library({ readingStatuses: [read(dune)] }), editions, today, 'en')).toEqual({ year: 2026, read: 0, added: 0 });
    expect(yearCard(library({ copies: [got(dune)] }), editions, today, 'en')).toEqual({ year: 2026, read: 0, added: 0 });
  });
});
