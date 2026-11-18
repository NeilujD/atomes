// Statistics (ADR 0019): every number of the screen, of the Home card and of
// the share picture, from the Library, the Editions the device knows and the
// Labels. "Today" is an input: no test reads the clock.
import { describe, expect, test } from 'vitest';
import type { Edition, Series } from '../catalog/catalog';
import type { Copy } from './copy';
import type { Label } from './label';
import type { Loan } from './loan';
import type { Library } from './model';
import type { ReadingStatus, Status } from './reading-status';
import type { Saved } from './records';
import { statistics, type StatsInput } from './stats';

// 18 November 2026 on the reader's device.
const today = new Date(2026, 10, 18, 9, 30);
const day = (date: string) => `${date}T00:00:00.000Z`;

let next = 0;
const edition = (title: string, more: Partial<Edition> = {}): Edition => {
  next += 1;
  const isbn = `978000000${String(next).padStart(4, '0')}`;
  return {
    isbn,
    title,
    volumeTitle: null,
    authors: [],
    publisher: null,
    language: null,
    format: null,
    cover: null,
    work: { id: `wd:Q${next}`, title },
    series: null,
    volumes: [],
    volume: null,
    sources: ['BnF'],
    fetchedAt: '2026-01-01T00:00:00.000Z',
    ...more,
  };
};

const series = (id: string, title: string): Series => ({ id, title, sameAs: [] });
const copy = (books: Edition[], more: Partial<Copy> = {}): Saved<Copy> => ({
  rkey: `copy-${books.map(({ isbn }) => isbn).join('-')}`,
  value: { isbn: books[0].isbn, works: books.map(({ work }) => work.id), createdAt: '2026-11-01T10:00:00.000Z', ...more },
});
const status = (book: Edition, chosen: Status, days: Partial<ReadingStatus> = {}): Saved<ReadingStatus> => ({
  rkey: book.work.id,
  value: { work: book.work.id, isbn: book.isbn, status: chosen, updatedAt: '2026-11-01T10:00:00.000Z', ...days },
});
const read = (book: Edition, finishedAt?: string) => status(book, 'read', finishedAt ? { finishedAt: day(finishedAt) } : {});
const label = (rkey: string, name: string, works: Edition[], series?: string[]): Saved<Label> => ({
  rkey,
  value: { name, works: works.map(({ work }) => work.id), ...(series && { series }), createdAt: '2026-01-01T00:00:00.000Z' },
});

function stats(parts: Partial<Library>, books: Edition[] = [], more: Partial<Omit<StatsInput, 'library' | 'editions'>> = {}) {
  const library: Library = { copies: [], readingStatuses: [], follows: [], loans: [], toBuy: [], ...parts };
  return statistics({
    library,
    editions: new Map(books.map((each) => [each.isbn, each])),
    labels: [],
    query: { period: 2026, label: null, ownedOnly: false },
    language: 'fr',
    today,
    ...more,
  });
}

describe('an empty Library', () => {
  test('every number is zero, no year is offered, and the default period is All time', () => {
    const found = stats({});

    expect(found).toMatchObject({ read: 0, added: 0, reading: 0, ownedUnread: 0, years: [], defaultPeriod: 'all', undated: { reads: 0, copies: 0 } });
    expect(found.loans).toEqual({ lentNow: 0, started: 0, averageDays: null });
    expect(found.columns.groups.every((group) => group.read === 0 && group.added === 0)).toBe(true);
    expect(found.mostRead.series).toEqual({ rows: [], outside: 0 });
  });
});

describe('read: a read counts in the year and the month of its finish day', () => {
  const lastDay = edition('Dune');
  const firstDay = edition('Fondation');
  const library = { readingStatuses: [read(lastDay, '2025-12-31'), read(firstDay, '2026-01-01')] };

  test('a read finished on 31 December counts in that year, one finished on 1 January in the next', () => {
    expect(stats(library, [lastDay, firstDay], { query: { period: 2025, label: null, ownedOnly: false } }).read).toBe(1);
    expect(stats(library, [lastDay, firstDay], { query: { period: 2026, label: null, ownedOnly: false } }).read).toBe(1);
    expect(stats(library, [lastDay, firstDay], { query: { period: 'all', label: null, ownedOnly: false } }).read).toBe(2);
  });

  test('the columns of a year are its twelve months, and each read sits in the month of its finish day', () => {
    const in2025 = stats(library, [lastDay, firstDay], { query: { period: 2025, label: null, ownedOnly: false } }).columns;
    const in2026 = stats(library, [lastDay, firstDay], { query: { period: 2026, label: null, ownedOnly: false } }).columns;

    expect(in2025.scale).toBe('month');
    expect(in2025.groups.map(({ at }) => at)).toEqual(['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12']);
    expect(in2025.groups.map(({ read }) => read)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(in2026.groups.map(({ read }) => read)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('reads with no date', () => {
  const dated = edition('Dune');
  const bulk = edition('One Piece 1');
  const markedBack = edition('Fondation');
  const library = {
    readingStatuses: [
      read(dated, '2026-03-14'),
      read(bulk),
      // A bulk mark back to unread keeps the days: only a Work read now counts.
      status(markedBack, 'unread', { startedAt: day('2025-02-01'), finishedAt: day('2025-02-10') }),
    ],
  };
  const books = [dated, bulk, markedBack];

  test('a read with no finish day counts in All time and in "with no date", never in a year or a column', () => {
    const year = stats(library, books);
    const allTime = stats(library, books, { query: { period: 'all', label: null, ownedOnly: false } });

    expect([year.read, allTime.read]).toEqual([1, 2]);
    expect([year.undated.reads, allTime.undated.reads]).toEqual([1, 1]);
    expect(year.columns.groups.reduce((sum, group) => sum + group.read, 0)).toBe(1);
    expect(allTime.columns.groups.reduce((sum, group) => sum + group.read, 0)).toBe(1);
  });

  test('a finish day on a Work that is not read now counts nowhere, and offers no year', () => {
    const found = stats(library, books, { query: { period: 2025, label: null, ownedOnly: false } });

    expect([found.read, found.years]).toEqual([0, [2026]]);
  });
});

describe('added: a Copy counts by the day the reader got it', () => {
  const tome1 = edition('Lanfeust 1', { volumes: [1, 2] });
  const tome2 = edition('Lanfeust 2');
  const dune = edition('Dune');
  const fondation = edition('Fondation');
  const books = [tome1, tome2, dune, fondation];
  const library = {
    copies: [
      // An omnibus: one Copy, two Works.
      copy([tome1, tome2], { acquiredAt: day('2026-01-01') }),
      copy([dune], { acquiredAt: day('2025-12-31') }),
      // Series Onboarding: got before, no day.
      copy([fondation]),
    ],
  };

  test('an omnibus Copy counts once in "added", and each of its Works once in the Library', () => {
    const found = stats(library, books);

    expect(found.added).toBe(1);
    expect(found.columns.groups.map(({ added }) => added)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(found.libraryToday).toEqual([
      { status: 'unread', count: 4 },
      { status: 'reading', count: 0 },
      { status: 'read', count: 0 },
      { status: 'abandoned', count: 0 },
    ]);
  });

  test('a Copy got on 31 December counts in that year, and a Copy with no day in All time and in "with no date"', () => {
    const in2025 = stats(library, books, { query: { period: 2025, label: null, ownedOnly: false } });
    const allTime = stats(library, books, { query: { period: 'all', label: null, ownedOnly: false } });

    expect([in2025.added, allTime.added]).toEqual([1, 3]);
    expect([in2025.undated.copies, allTime.undated.copies]).toEqual([1, 1]);
    expect(allTime.columns.groups).toEqual([
      { at: '2025', read: 0, added: 1 },
      { at: '2026', read: 0, added: 1 },
    ]);
  });
});

describe('the state of today and the filters', () => {
  const onePieceSeries = series('wd:Q673', 'One Piece');
  const op1 = edition('One Piece 1', { series: onePieceSeries, volume: 1, volumes: [1] });
  const op2 = edition('One Piece 2', { series: onePieceSeries, volume: 2, volumes: [2] });
  const dune = edition('Dune');
  const borrowed = edition('Fondation');
  const books = [op1, op2, dune, borrowed];
  const library = {
    copies: [copy([op1], { acquiredAt: day('2026-04-01') }), copy([op2], { acquiredAt: day('2024-04-01') }), copy([dune], { acquiredAt: day('2026-05-01') })],
    readingStatuses: [
      status(op1, 'reading', { startedAt: day('2026-04-02') }),
      read(dune, '2026-06-01'),
      // Read and not owned: a book borrowed from a friend.
      read(borrowed, '2026-07-01'),
    ],
  };
  // A Label on a Series: every Work of the Series carries it.
  const manga = label('3lbma', 'Manga', [], [onePieceSeries.id]);
  const sciFi = label('3lbsf', 'SF', [dune, borrowed]);
  const query = (more: Partial<StatsInput['query']>) => ({ query: { period: 2026 as const, label: null, ownedOnly: false, ...more }, labels: [manga, sciFi] });

  test('Reading and Owned-Unread are the state of today, whatever the period', () => {
    const in2026 = stats(library, books, query({}));
    const in2020 = stats(library, books, query({ period: 2020 }));

    expect([in2026.reading, in2026.ownedUnread]).toEqual([1, 1]);
    expect([in2020.reading, in2020.ownedUnread, in2020.libraryToday]).toEqual([in2026.reading, in2026.ownedUnread, in2026.libraryToday]);
  });

  test('a Label on a Series keeps every Volume of the Series, and its Copies only', () => {
    const found = stats(library, books, query({ label: '3lbma' }));

    expect(found).toMatchObject({ read: 0, added: 1, reading: 1, ownedUnread: 1 });
    expect(found.libraryToday.map(({ count }) => count)).toEqual([1, 1, 0, 0]);
  });

  test('a Label on Works keeps those Works', () => {
    expect(stats(library, books, query({ label: '3lbsf' }))).toMatchObject({ read: 2, added: 1, reading: 0, ownedUnread: 0 });
  });

  test('"owned only" leaves out a Work read and not owned', () => {
    expect(stats(library, books, query({})).read).toBe(2);
    expect(stats(library, books, query({ ownedOnly: true })).read).toBe(1);
    expect(stats(library, books, query({ ownedOnly: true })).libraryToday.map(({ count }) => count)).toEqual([1, 1, 1, 0]);
  });

  test('a Label deleted since (on another device) filters nothing', () => {
    expect(stats(library, books, query({ label: '3lbgone' })).read).toBe(2);
  });

  test('the line under "Your Library today": the Copies owned, their Series, and the Works read and not owned, whatever the period', () => {
    expect(stats(library, books, query({ period: 2020 })).owned).toEqual({ copies: 3, series: 1, readNotOwned: 1 });
    expect(stats(library, books, query({ label: '3lbsf' })).owned).toEqual({ copies: 1, series: 0, readNotOwned: 1 });
    expect(stats(library, books, query({ ownedOnly: true })).owned.readNotOwned).toBe(0);
  });
});

describe('Most read', () => {
  const inSeries = (title: string) => edition(`${title} 1`, { series: series(`wd:Q9${next}`, title) });

  test('six Series, the most read first, ties in the text order of the language, and the reads in no Series', () => {
    const asterixSeries = series('wd:Q1', 'Astérix');
    const asterix = [1, 2, 3].map((volume) => edition(`Astérix ${volume}`, { series: asterixSeries }));
    // In French, "Élan" comes after "Blake"; in code points it would come after "Zorro" and cut Zorro off.
    const ties = ['Zorro', 'Élan', 'Blake', 'Akira', 'Monster', 'Naruto'].map((title) => inSeries(title));
    const alone = edition('Dune');
    const books = [...asterix, ...ties, alone];
    const found = stats({ readingStatuses: books.map((book) => read(book, '2026-03-01')) }, books);

    expect(found.mostRead.series).toEqual({
      rows: [
        { name: 'Astérix', value: 3 },
        { name: 'Akira', value: 1 },
        { name: 'Blake', value: 1 },
        { name: 'Élan', value: 1 },
        { name: 'Monster', value: 1 },
        { name: 'Naruto', value: 1 },
      ],
      outside: 1,
    });
  });

  test('a year ranks the reads finished in it; All time ranks every read, those with no date too', () => {
    const before = inSeries('Akira');
    const now = inSeries('Blake');
    const bulk = inSeries('Monster');
    const library = { readingStatuses: [read(before, '2025-12-31'), read(now, '2026-01-01'), read(bulk)] };

    expect(stats(library, [before, now, bulk]).mostRead.series.rows.map(({ name }) => name)).toEqual(['Blake']);
    expect(stats(library, [before, now, bulk], { query: { period: 'all', label: null, ownedOnly: false } }).mostRead.series.rows.map(({ name }) => name)).toEqual([
      'Akira',
      'Blake',
      'Monster',
    ]);
  });

  test('a Work by two authors counts for each; a Work with no author counts outside', () => {
    const goodOmens = edition('Good Omens', { authors: ['Terry Pratchett', 'Neil Gaiman'] });
    const discworld = edition('Mort', { authors: ['Terry Pratchett'] });
    const anonymous = edition('Beowulf');
    const books = [goodOmens, discworld, anonymous];

    expect(stats({ readingStatuses: books.map((book) => read(book, '2026-03-01')) }, books).mostRead.authors).toEqual({
      rows: [
        { name: 'Terry Pratchett', value: 2 },
        { name: 'Neil Gaiman', value: 1 },
      ],
      outside: 1,
    });
  });

  test('Labels count by name, a Label on a Series too; a read with no Label counts outside', () => {
    const seriesOf = series('wd:Q673', 'One Piece');
    const op1 = edition('One Piece 1', { series: seriesOf });
    const dune = edition('Dune');
    const plain = edition('Mort');
    const labels = [label('3lbma', 'Manga', [], [seriesOf.id]), label('3lbfa', 'Favoris', [op1, dune])];
    const books = [op1, dune, plain];

    expect(stats({ readingStatuses: books.map((book) => read(book, '2026-03-01')) }, books, { labels }).mostRead.labels).toEqual({
      rows: [
        { name: 'Favoris', value: 2 },
        { name: 'Manga', value: 1 },
      ],
      outside: 1,
    });
  });

  test('publishers come from the Catalog; a Work the Catalog does not know counts outside, and its typed details give its Series and authors', () => {
    const known = edition('Dune', { publisher: 'Pocket', authors: ['Frank Herbert'] });
    const unknown = edition('Le Petit Prince');
    const typed = copy([unknown], { details: { title: 'Le Petit Prince', authors: ['Antoine de Saint-Exupéry'], series: 'Folio Junior' } });
    // The device knows the Edition of "Dune" only.
    const found = stats({ copies: [typed], readingStatuses: [read(known, '2026-03-01'), read(unknown, '2026-04-01')] }, [known]);

    expect(found.mostRead.publishers).toEqual({ rows: [{ name: 'Pocket', value: 1 }], outside: 1 });
    expect(found.mostRead.series).toEqual({ rows: [{ name: 'Folio Junior', value: 1 }], outside: 1 });
    expect(found.mostRead.authors.rows).toEqual([
      { name: 'Antoine de Saint-Exupéry', value: 1 },
      { name: 'Frank Herbert', value: 1 },
    ]);
  });
});

describe('Loans', () => {
  const dune = edition('Dune');
  const fondation = edition('Fondation');
  const mort = edition('Mort');
  const books = [dune, fondation, mort];
  // A Loan holds the moment of the tap (lend, model.ts): its day is the day on the device.
  const at = (...parts: [number, number, number, number]) => new Date(...parts).toISOString();
  const loan = (rkey: string, of: Edition, lentAt: string, returnedAt?: string): Saved<Loan> => ({
    rkey,
    value: { copy: `copy-${of.isbn}`, borrower: 'Léa', lentAt, ...(returnedAt && { returnedAt }), createdAt: lentAt },
  });
  const library = {
    copies: [copy([dune]), copy([fondation]), copy([mort])],
    loans: [
      // 11 days.
      loan('l1', dune, at(2026, 2, 1, 10), at(2026, 2, 12, 18)),
      // Lent late on 31 December, back on 5 January: 5 days, returned in 2026.
      loan('l2', fondation, at(2025, 11, 31, 23), at(2026, 0, 5, 9)),
      // Open: lent now.
      loan('l3', mort, at(2026, 10, 1, 10)),
      // A Loan of a Copy removed since counts nowhere.
      { rkey: 'l4', value: { copy: 'copy-gone', borrower: 'Léa', lentAt: at(2026, 5, 1, 10), createdAt: at(2026, 5, 1, 10) } },
    ],
  };

  test('lent now, the Loans that started in the period, and the average days of the Loans returned in it', () => {
    expect(stats(library, books).loans).toEqual({ lentNow: 1, started: 2, averageDays: 8 });
    expect(stats(library, books, { query: { period: 2025, label: null, ownedOnly: false } }).loans).toEqual({ lentNow: 1, started: 1, averageDays: null });
    expect(stats(library, books, { query: { period: 'all', label: null, ownedOnly: false } }).loans).toEqual({ lentNow: 1, started: 3, averageDays: 8 });
  });

  test('a Copy with two open Loans (one from each device) is lent once', () => {
    const twice = { ...library, loans: [...library.loans, loan('l5', mort, at(2026, 10, 2, 10))] };

    expect(stats(twice, books).loans.lentNow).toBe(1);
  });

  test('a Label keeps the Loans of its Copies only', () => {
    const labels = [label('3lbsf', 'SF', [fondation, mort])];

    expect(stats(library, books, { labels, query: { period: 2026, label: '3lbsf', ownedOnly: false } }).loans).toEqual({ lentNow: 1, started: 1, averageDays: 5 });
  });
});

describe('the years offered and the default period', () => {
  const dune = edition('Dune');
  const fondation = edition('Fondation');

  test('the years with a finish day or an acquisition day, the latest first; the current year is the default when it has one', () => {
    const found = stats({ readingStatuses: [read(dune, '2024-05-01')], copies: [copy([fondation], { acquiredAt: day('2026-02-02') })] }, [dune, fondation]);

    expect([found.years, found.defaultPeriod]).toEqual([[2026, 2024], 2026]);
  });

  test('with no day in the current year, the default period is All time', () => {
    const found = stats({ readingStatuses: [read(dune, '2024-05-01')] }, [dune]);

    expect([found.years, found.defaultPeriod]).toEqual([[2024], 'all']);
  });

  test('the years offered are those of the whole Library: a Label does not take a year away from the picker', () => {
    const sciFi = label('3lbsf', 'SF', [dune]);
    const found = stats({ readingStatuses: [read(dune, '2024-05-01'), read(fondation, '2026-02-02')] }, [dune, fondation], {
      labels: [sciFi],
      query: { period: 2024, label: '3lbsf', ownedOnly: false },
    });

    expect([found.read, found.years, found.defaultPeriod]).toEqual([1, [2026, 2024], 2026]);
  });

  test('"today" is the day on the device: 1 January in the morning is the new year', () => {
    const found = stats({ readingStatuses: [read(dune, '2027-01-01')] }, [dune], { today: new Date(2027, 0, 1, 0, 15) });

    expect(found.defaultPeriod).toBe(2027);
  });
});

describe('All time', () => {
  test('the columns are the years from the first dated read or Copy to the last, empty years included', () => {
    const old = edition('Dune');
    const recent = edition('Fondation');
    const library = { readingStatuses: [read(old, '2023-06-01'), read(recent, '2026-02-01')], copies: [copy([recent], { acquiredAt: day('2022-12-31') })] };
    const found = stats(library, [old, recent], { query: { period: 'all', label: null, ownedOnly: false } }).columns;

    expect(found.scale).toBe('year');
    expect(found.groups).toEqual([
      { at: '2022', read: 0, added: 1 },
      { at: '2023', read: 1, added: 0 },
      { at: '2024', read: 0, added: 0 },
      { at: '2025', read: 0, added: 0 },
      { at: '2026', read: 1, added: 0 },
    ]);
  });
});
