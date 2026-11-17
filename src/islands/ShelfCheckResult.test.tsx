// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, test } from 'vitest';
import type { Edition } from '../lib/catalog/catalog';
import type { SeriesLine, ShelfCheck } from '../lib/library/shelf-check';
import { ShelfCheckResult, type ResultProps } from './ShelfCheckResult';

afterEach(cleanup);

const onePiece = { id: 'wd:Q673', title: 'One Piece', sameAs: [] };
const onePiece56: Edition = {
  isbn: '9782723478991',
  title: 'One Piece',
  volumeTitle: 'Merci pour tout',
  authors: ['Eiichirō Oda'],
  publisher: 'Glénat',
  language: 'fre',
  format: '18 cm',
  cover: null,
  work: { id: 'inv:56', title: 'Merci pour tout' },
  series: onePiece,
  volumes: [56],
  volume: 56,
  sources: ['BnF'],
  fetchedAt: '2026-11-05T10:00:00.000Z',
};
const horde: Edition = { ...onePiece56, isbn: '9782072927515', title: 'La Horde du Contrevent', volumeTitle: null, authors: ['Alain Damasio'], publisher: 'Folio', language: null, format: null, work: { id: 'wd:Q1', title: 'La Horde du Contrevent' }, series: null, volumes: [], volume: null };
const line = (change: Partial<SeriesLine> = {}): SeriesLine => ({ owned: 3, read: 1, missing: 0, ownedVolumes: [1, 2, 3], readVolumes: [1], total: 6, followable: false, ...change });

function screenFor(check: ShelfCheck, change: Partial<ResultProps> = {}) {
  const calls: string[] = [];
  const props: ResultProps = {
    book: { isbn: onePiece56.isbn, work: onePiece56.work.id, edition: onePiece56, title: onePiece56.title },
    check,
    cover: null,
    canScan: true,
    onClose: () => calls.push('close'),
    onScan: () => calls.push('scan'),
    onAdd: (read) => calls.push(read ? 'add read' : 'add'),
    onFollow: () => calls.push('follow'),
    ...change,
  };
  const { container } = render(<ShelfCheckResult {...props} />);
  return { calls, screen: container.querySelector<HTMLElement>('.result-screen')! };
}

describe('the Shelf Check result screen', () => {
  test('not in the Library: green, the Series title and Volume, authors and publisher, chips, Add to Library and Add and mark as read', () => {
    const { calls, screen: shown } = screenFor({ kind: 'new', status: 'unread', followed: null });

    expect(shown.dataset.tone).toBe('go');
    expect(screen.getByText('Not in your Library')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'One Piece, Volume 56' })).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Eiichirō Oda · Glénat')).toBeTruthy();
    expect([...shown.querySelectorAll('.result-chip')].map((chip) => chip.textContent)).toEqual(['French', '18 cm', 'ISBN 9782723478991', 'Private']);
    fireEvent.click(screen.getByRole('button', { name: 'Add to Library' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add and mark as read' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Scan the barcode' }));
    expect(calls).toEqual(['add', 'add read', 'close', 'scan']);
  });

  test('a book of no Series: its title; chips with no data are left out', () => {
    const { screen: shown } = screenFor(
      { kind: 'new', status: 'unread', followed: null },
      { book: { isbn: horde.isbn, work: horde.work.id, edition: horde, title: horde.title } },
    );

    expect(screen.getByRole('heading', { name: 'La Horde du Contrevent' })).toBeTruthy();
    expect([...shown.querySelectorAll('.result-chip')].map((chip) => chip.textContent)).toEqual(['ISBN 9782072927515', 'Private']);
  });

  test('missing from a Followed Series and read not owned: green, their pill', () => {
    screenFor({ kind: 'missing', status: 'unread', followed: onePiece });
    expect(screen.getByText('Missing from One Piece')).toBeTruthy();
    cleanup();

    const { screen: shown } = screenFor({ kind: 'read', status: 'read', followed: null });
    expect(shown.dataset.tone).toBe('go');
    expect(screen.getByText('Read, not in your Library')).toBeTruthy();
    // Already read: only Add to Library.
    expect(screen.queryByRole('button', { name: 'Add and mark as read' })).toBeNull();
    expect(screen.getByRole('link', { name: 'One Piece, Volume 56' }).getAttribute('href')).toBe('/book?work=inv%3A56');
  });

  test('owned: orange, the title opens the Book page, the date of the first Copy, Scan another book and Add another Copy', () => {
    const { calls, screen: shown } = screenFor({ kind: 'owned', status: 'unread', followed: null }, { addedAt: '2026-11-02T10:00:00.000Z' });

    expect(shown.dataset.tone).toBe('owned');
    expect(screen.getByText('Already in your Library')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'One Piece, Volume 56' }).getAttribute('href')).toBe('/book?work=inv%3A56');
    expect(screen.getByText('Added on November 2, 2026')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Scan another book' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add another Copy' }));
    expect(calls).toEqual(['scan', 'add']);
  });

  test('this device cannot tell, with no Catalog data: neutral, the reason, nothing to add', () => {
    const { screen: shown } = screenFor(
      { kind: 'unknown', status: 'unread', followed: null },
      { book: { isbn: '9791099999993', work: 'isbn:9791099999993', title: 'ISBN 9791099999993' }, canScan: false },
    );

    expect(shown.dataset.tone).toBe('unknown');
    expect(screen.getByText('Cannot tell on this device')).toBeTruthy();
    expect(screen.getByText('This device does not know this book yet. Check online later.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add to Library' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Scan the barcode' })).toBeNull();
  });

  test('the Series card: counts, one segment per Volume (read too) with this one marked, the Series line, Follow', () => {
    const series = line({ owned: 3, read: 2, ownedVolumes: [1, 2, 4], readVolumes: [1, 3], total: 6, missing: 1, followable: true });
    const { calls, screen: shown } = screenFor({ kind: 'new', status: 'unread', followed: null, series }, { book: { isbn: 'x', work: 'w', edition: { ...onePiece56, volumes: [5] }, title: '' } });

    const card = screen.getByRole('region', { name: 'Your Series' });
    expect(card.textContent).toContain('3 owned · 2 read');
    expect(card.textContent).toContain('You have 3 of 6 · 1 missing');
    expect([...shown.querySelectorAll('.result-segment')].map((each) => (each as HTMLElement).dataset.state)).toEqual(['read', 'owned', 'read-not-owned', 'owned', 'this', 'not-owned']);
    fireEvent.click(screen.getByRole('button', { name: 'Follow' }));
    expect(calls).toEqual(['follow']);
  });

  test('a long Series: one bar, filled to the share owned, a mark at this Volume', () => {
    const { screen: shown } = screenFor({ kind: 'new', status: 'unread', followed: null, series: line({ owned: 10, ownedVolumes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], total: 100 }) });

    expect(shown.querySelectorAll('.result-segment')).toHaveLength(0);
    expect(shown.querySelector<HTMLElement>('.result-bar-fill')!.style.width).toBe('10%');
    expect(parseFloat(shown.querySelector<HTMLElement>('.result-bar-mark')!.style.left)).toBeCloseTo(55.5);
  });

  test('while the Edition Line loads, the place of the Series card is kept', () => {
    const { screen: shown } = screenFor({ kind: 'new', status: 'unread', followed: null }, { seriesLoading: true });

    expect(shown.querySelector('.result-card-skeleton')).not.toBeNull();
  });

  test('while a Copy saves: its button is busy, no other button works', () => {
    screenFor({ kind: 'new', status: 'unread', followed: null }, { saving: 'read' });

    expect(screen.getByRole('button', { name: 'Add and mark as read' }).getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add to Library' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Close' }).disabled).toBe(true);
  });
});
