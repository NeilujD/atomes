import { describe, expect, test } from 'vitest';
import type { Edition } from '../catalog/catalog';
import type { Copy } from './copy';
import type { Loan } from './loan';
import { bookPage, isOwned, lend, returnLoans, statusChange, type Library } from './model';
import type { ReadingStatus, Status } from './reading-status';
import type { Saved } from './records';

const onePiece56: Edition = {
  isbn: '9782723478991',
  title: 'One Piece',
  volumeTitle: 'Merci pour tout',
  authors: ['Eiichirō Oda'],
  publisher: 'Glénat',
  language: 'fre',
  format: '18 x 12 cm',
  cover: 'https://inventaire.io/img/entities/65883d822ab1b56d8f46aeb26c35d1feb9098a9b',
  work: { id: 'inv:ce9131dff9916ae2e619de81800be29a', title: 'Merci pour tout' },
  series: { id: 'wd:Q673', title: 'One Piece' },
  volumes: [56],
  volume: 56,
  sources: ['BnF', 'Inventaire'],
  fetchedAt: '2026-11-05T10:00:00.000Z',
};
const work = onePiece56.work.id;

const copy = (rkey: string, change: Partial<Copy> = {}): Saved<Copy> => ({
  rkey,
  value: { isbn: onePiece56.isbn, works: [work], createdAt: '2026-11-05T10:00:00.000Z', ...change },
});

const library = (change: Partial<Library> = {}): Library => ({ copies: [], readingStatuses: [], follows: [], loans: [], toBuy: [], ...change });
const catalog = new Map([[onePiece56.isbn, onePiece56]]);

describe('Book page', () => {
  test('a Work with a Copy and no Reading Status: Catalog details, unread, the Copy with its Edition', () => {
    expect(bookPage(work, library({ copies: [copy('3m2a')] }), catalog)).toEqual({
      work,
      isbn: onePiece56.isbn,
      title: 'One Piece',
      volumeTitle: 'Merci pour tout',
      authors: ['Eiichirō Oda'],
      series: 'One Piece',
      volume: '56',
      volumes: [56],
      // From the Atomes server, never from the source: the source would learn who looks at this book.
      cover: '/api/catalog/editions/9782723478991/cover',
      status: 'unread',
      finishedAt: undefined,
      copies: [{ rkey: '3m2a', isbn: onePiece56.isbn, edition: 'Glénat · French · 18 x 12 cm', loan: undefined, pastLoans: [] }],
    });
  });

  test('the Reading Status and its finish date come from the record keyed by the Work', () => {
    const page = bookPage(work, library({ copies: [copy('3m2a')], readingStatuses: [status('read', '2026-11-20T00:00:00.000Z')] }), catalog);

    expect([page?.status, page?.finishedAt]).toEqual(['read', '2026-11-20T00:00:00.000Z']);
  });

  test('a status this app does not know counts as no record: unread', () => {
    const page = bookPage(work, library({ copies: [copy('3m2a')], readingStatuses: [status('lent' as Status)] }), catalog);

    expect(page?.status).toBe('unread');
  });

  test('a Reading Status with no Copy is still in the Library, with no Copies', () => {
    const page = bookPage(work, library({ readingStatuses: [status('reading')] }), catalog);

    expect([page?.title, page?.status, page?.copies]).toEqual(['One Piece', 'reading', []]);
  });

  test('every Copy of the Work, oldest first, with who has it', () => {
    const page = bookPage(
      work,
      library({
        copies: [
          copy('3m2c', { createdAt: '2026-11-06T10:00:00.000Z' }),
          copy('3m2a'),
          copy('3m2b', { works: ['wd:Q190192'], isbn: '9782266320542' }),
        ],
        loans: [loan('l1', '3m2c', 'Camille', '2026-11-07T10:00:00.000Z')],
      }),
      catalog,
    );

    expect(page?.copies.map(({ rkey, loan }) => [rkey, loan?.borrower])).toEqual([
      ['3m2a', undefined],
      ['3m2c', 'Camille'],
    ]);
  });

  test('an omnibus Copy shows on the page of each Work it contains', () => {
    const omnibus = copy('3m2a', { works: ['wd:Q1', work] });

    expect(bookPage(work, library({ copies: [omnibus] }), catalog)?.copies).toHaveLength(1);
    expect(bookPage('wd:Q1', library({ copies: [omnibus] }), catalog)?.copies).toHaveLength(1);
  });

  test('with no Catalog answer (offline, unknown ISBN) the page uses what the reader typed, else the ISBN', () => {
    const typed = copy('3m2a', { details: { title: 'Jujutsu Kaisen Modulo', authors: ['Gege Akutami'], volume: '1' } });

    expect(bookPage(work, library({ copies: [typed] }), new Map())).toMatchObject({
      title: 'Jujutsu Kaisen Modulo',
      authors: ['Gege Akutami'],
      series: null,
      volume: '1',
      copies: [{ edition: '' }],
    });
    expect(bookPage(work, library({ copies: [copy('3m2a')] }), new Map())?.title).toBe('ISBN 9782723478991');
  });

  test('a book typed by hand shows like a Catalog book: its details, its Reading Status, its Copies', () => {
    const isbn = '9791032722077';
    const typedWork = `isbn:${isbn}`;
    const typed = library({
      copies: [
        {
          rkey: '3m2a',
          value: {
            isbn,
            works: [typedWork],
            details: { title: 'Jujutsu Kaisen Modulo', authors: ['Gege Akutami', 'Yuji Iwasaki'], series: 'Jujutsu Kaisen Modulo', volume: '1' },
            createdAt: '2026-11-05T10:00:00.000Z',
          },
        },
      ],
      readingStatuses: [
        { rkey: typedWork, value: { work: typedWork, isbn, status: 'read', finishedAt: '2026-11-06T00:00:00.000Z', updatedAt: '2026-11-06T00:00:00.000Z' } },
      ],
    });

    expect(bookPage(typedWork, typed, new Map())).toEqual({
      work: typedWork,
      isbn,
      title: 'Jujutsu Kaisen Modulo',
      volumeTitle: null,
      authors: ['Gege Akutami', 'Yuji Iwasaki'],
      series: 'Jujutsu Kaisen Modulo',
      volume: '1',
      volumes: [],
      cover: null,
      status: 'read',
      finishedAt: '2026-11-06T00:00:00.000Z',
      copies: [{ rkey: '3m2a', isbn, edition: '', loan: undefined, pastLoans: [] }],
    });
  });

  test('a Work with no Copy and no Reading Status is not in the Library', () => {
    expect(bookPage(work, library({ copies: [copy('3m2b', { works: ['wd:Q190192'] })] }), catalog)).toBeUndefined();
  });
});

describe('Loans', () => {
  const now = new Date('2026-11-12T09:00:00.000Z');
  const copies = (page: ReturnType<typeof bookPage>) => page?.copies.map(({ rkey, loan, pastLoans }) => ({ rkey, loan, pastLoans }));

  test('an open Loan shows the Copy as lent, to whom and since when', () => {
    const lent = library({ copies: [copy('3m2a')], loans: [loan('l1', '3m2a', 'Camille', '2026-11-03T10:00:00.000Z')] });

    expect(copies(bookPage(work, lent, catalog))).toEqual([
      { rkey: '3m2a', loan: { rkey: 'l1', borrower: 'Camille', lentAt: '2026-11-03T10:00:00.000Z' }, pastLoans: [] },
    ]);
  });

  test('returned Loans stay as the Copy history, latest first; the Copy is back', () => {
    const back = library({
      copies: [copy('3m2a')],
      loans: [
        loan('l1', '3m2a', 'Camille', '2026-09-01T10:00:00.000Z', '2026-09-20T10:00:00.000Z'),
        loan('l2', '3m2a', 'Sam', '2026-10-01T10:00:00.000Z', '2026-10-15T10:00:00.000Z'),
      ],
    });

    expect(copies(bookPage(work, back, catalog))).toEqual([
      {
        rkey: '3m2a',
        loan: undefined,
        pastLoans: [
          { borrower: 'Sam', lentAt: '2026-10-01T10:00:00.000Z', returnedAt: '2026-10-15T10:00:00.000Z' },
          { borrower: 'Camille', lentAt: '2026-09-01T10:00:00.000Z', returnedAt: '2026-09-20T10:00:00.000Z' },
        ],
      },
    ]);
  });

  test('Loans of another Copy are not shown on this one', () => {
    const other = library({ copies: [copy('3m2a')], loans: [loan('l1', '3m2z', 'Camille', '2026-11-03T10:00:00.000Z')] });

    expect(copies(bookPage(work, other, catalog))).toEqual([{ rkey: '3m2a', loan: undefined, pastLoans: [] }]);
  });

  test('lending a Copy opens a Loan from now, with the name trimmed', () => {
    expect(lend('3m2a', '  Camille ', now)).toEqual({
      copy: '3m2a',
      borrower: 'Camille',
      lentAt: '2026-11-12T09:00:00.000Z',
      createdAt: '2026-11-12T09:00:00.000Z',
    });
  });

  test('marking a Copy returned closes its open Loans (two devices may each have opened one), not the past ones', () => {
    const past = loan('l1', '3m2a', 'Sam', '2026-10-01T10:00:00.000Z', '2026-10-15T10:00:00.000Z');
    const open = [loan('l2', '3m2a', 'Camille', '2026-11-03T10:00:00.000Z'), loan('l3', '3m2a', 'Camille', '2026-11-03T10:05:00.000Z')];
    const lent = library({ copies: [copy('3m2a')], loans: [past, ...open, loan('l4', '3m2z', 'Lou', '2026-11-01T10:00:00.000Z')] });

    expect(returnLoans('3m2a', lent, now)).toEqual(open.map(({ rkey, value }) => ({ rkey, value: { ...value, returnedAt: '2026-11-12T09:00:00.000Z' } })));
  });
});

describe('Is owned', () => {
  test('a Work is owned when the reader has a Copy that contains it', () => {
    expect(isOwned(onePiece56, library({ copies: [copy('3m2a')] }))).toBe(true);
    expect(isOwned(onePiece56, library({ copies: [copy('3m2a', { works: ['wd:Q1', work], isbn: '9782344068922' })] }))).toBe(true);
  });

  test('a lent Copy is still owned', () => {
    const lent = library({ copies: [copy('3m2a')], loans: [loan('l1', '3m2a', 'Camille', '2026-11-03T10:00:00.000Z')] });

    expect(isOwned(onePiece56, lent)).toBe(true);
  });

  test('a Copy of this Edition saved before the Catalog knew its Work makes the Work owned', () => {
    const typed = copy('3m2a', { works: [`isbn:${onePiece56.isbn}`] });

    expect(isOwned(onePiece56, library({ copies: [typed] }))).toBe(true);
  });

  test('read with no Copy (borrowed), or a Copy of another Work, is not owned', () => {
    expect(isOwned(onePiece56, library({ readingStatuses: [status('read')] }))).toBe(false);
    expect(isOwned(onePiece56, library({ copies: [copy('3m2b', { works: ['wd:Q190192'], isbn: '9782266320542' })] }))).toBe(false);
  });
});

function loan(rkey: string, copyKey: string, borrower: string, lentAt: string, returnedAt?: string): Saved<Loan> {
  return { rkey, value: { copy: copyKey, borrower, lentAt, ...(returnedAt ? { returnedAt } : {}), createdAt: lentAt } };
}

describe('Reading Status change', () => {
  const now = new Date('2026-11-07T08:00:00.000Z');

  test('a new status is saved for the Edition given, with no finish date', () => {
    expect(statusChange(work, onePiece56.isbn, 'reading', library(), now)).toEqual({
      work,
      isbn: onePiece56.isbn,
      status: 'reading',
      updatedAt: '2026-11-07T08:00:00.000Z',
    });
  });

  test('the current status is not saved again, so its finish date stays', () => {
    const read = library({ readingStatuses: [status('read', '2026-11-20T00:00:00.000Z')] });

    expect(statusChange(work, onePiece56.isbn, 'read', read, now)).toBeUndefined();
  });

  test('"not yet" with no record is already true: nothing to save', () => {
    expect(statusChange(work, onePiece56.isbn, 'unread', library(), now)).toBeUndefined();
  });

  test('a change keeps the Edition already read', () => {
    const reading = library({ readingStatuses: [status('reading')] });

    expect(statusChange(work, '9782344068922', 'abandoned', reading, now)?.isbn).toBe(onePiece56.isbn);
  });
});

function status(value: Status, finishedAt?: string): Saved<ReadingStatus> {
  return {
    rkey: work,
    value: { work, isbn: onePiece56.isbn, status: value, finishedAt, updatedAt: '2026-11-05T10:00:00.000Z' },
  };
}
