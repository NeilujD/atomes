// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, test } from 'vitest';
import type { Edition } from '../lib/catalog/catalog';
import { saveCopy } from '../lib/library/copy';
import { followCollection, saveFollow, type Follow } from '../lib/library/follow';
import { memorySpace } from '../lib/library/memory-space.fake';
import { saveReadingStatus } from '../lib/library/reading-status';
import { Series, type Sources } from './Series';

const blacksad = { id: 'wd:Q1000001', title: 'Blacksad' };

// An ISBN-13 from its first 12 digits.
const isbn = (twelve: string) => {
  const sum = [...twelve].reduce((total, digit, i) => total + Number(digit) * (i % 2 === 0 ? 1 : 3), 0);
  return `${twelve}${(10 - (sum % 10)) % 10}`;
};
// Volume n of line A (Dargaud, French) or line B (Dark Horse, English).
const volume = (n: number, line: 'A' | 'B' = 'A', change: Partial<Edition> = {}): Edition => ({
  isbn: isbn(`${line === 'A' ? '979109999' : '978150670'}${String(n).padStart(3, '0')}`),
  title: 'Blacksad',
  volumeTitle: null,
  authors: ['Juan Díaz Canales'],
  publisher: line === 'A' ? 'Dargaud' : 'Dark Horse',
  language: line === 'A' ? 'fre' : 'eng',
  format: null,
  cover: null,
  work: { id: `wd:Q${line === 'A' ? 2 : 3}00000${n}`, title: `Blacksad ${n}` },
  series: blacksad,
  volume: n,
  sources: ['BnF'],
  fetchedAt: '2026-11-06T10:00:00.000Z',
  ...change,
});
const lineA = [1, 2, 3, 4, 5].map((n) => volume(n, 'A'));
const lineB = [1, 2, 3, 4, 5].map((n) => volume(n, 'B'));
const all = [...lineA, ...lineB];

// The reader owns Volumes 1 and 3 of line A and read Volume 1; `follow` says how they follow Blacksad.
async function seriesPage(follow?: Follow['status'], editions: Edition[] = all) {
  const { space, stored } = memorySpace();
  if (follow) await saveFollow(space, { series: blacksad.id, anchorIsbn: lineA[0].isbn, status: follow, updatedAt: '2026-11-06T11:00:00.000Z' });
  for (const n of [1, 3]) await saveCopy(space, { isbn: lineA[n - 1].isbn, works: [lineA[n - 1].work.id], createdAt: '2026-11-06T11:00:00.000Z' });
  await saveReadingStatus(space, { work: lineA[0].work.id, isbn: lineA[0].isbn, status: 'read', updatedAt: '2026-11-07T10:00:00.000Z' });
  const sources: Sources = {
    open: () => Promise.resolve(space),
    volumes: (each) => Promise.resolve([lineA, lineB].find((line) => line.some(({ isbn: one }) => one === each))),
    editions: (isbns) => Promise.resolve(new Map(editions.filter(({ isbn: one }) => isbns.includes(one)).map((each) => [each.isbn, each]))),
  };
  render(<Series isbn={lineA[2].isbn} sources={sources} />);
  await screen.findByRole('heading', { name: 'Blacksad' });
  return { follows: () => stored(followCollection).map(({ value }) => value as Follow) };
}

const count = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;

afterEach(cleanup);

describe('Series page', () => {
  test('shows the counts, the Missing Volume and the spine row', async () => {
    await seriesPage('following');

    expect(screen.getByText('Following')).toBeTruthy();
    expect([count('owned'), count('read'), count('missing'), count('next')]).toEqual(['2', '1', '1', '4']);
    expect(screen.getByRole('heading', { name: 'Missing Volumes: 2' })).toBeTruthy();
    expect(screen.getByText('They are on your To Buy list.')).toBeTruthy();
    expect(['Volume 1: read', 'Volume 2: not owned', 'Volume 3: owned, not read', 'Volume 4: not owned'].map((name) => screen.getByText(name))).toHaveLength(4);
  });

  test('"Stop following" drops the Series, and Follow follows it again', async () => {
    const { follows } = await seriesPage('following');

    fireEvent.click(screen.getByRole('button', { name: 'Stop following' }));
    await screen.findByText('Dropped');
    expect(follows()[0]).toMatchObject({ status: 'dropped', anchorIsbn: lineA[0].isbn });
    expect(screen.getByText('Follow the Series to see them on your To Buy list.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Follow' }));
    await screen.findByText('Following');
    expect(follows()[0]).toMatchObject({ status: 'following' });
  });

  test('a Series not followed yet is followed in the Edition Line of the linked Volume', async () => {
    const { follows } = await seriesPage();
    expect(screen.getByText('Not followed')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Follow' }));

    await screen.findByText('Following');
    expect(follows()).toEqual([expect.objectContaining({ series: blacksad.id, anchorIsbn: lineA[2].isbn, status: 'following' })]);
  });

  test('switching Edition Line from a Volume saves the new anchor and fromVolume; the page shows the new line from it on', async () => {
    const { follows } = await seriesPage('following');

    fireEvent.click(screen.getByRole('button', { name: 'Switch Edition Line' }));
    fireEvent.input(screen.getByLabelText('ISBN of the first Volume you collect in the new Edition Line'), { target: { value: lineB[3].isbn } });
    fireEvent.submit(screen.getByRole('button', { name: 'Switch' }).closest('form')!);

    await screen.findByText('From Volume 4');
    expect(follows()[0]).toMatchObject({ anchorIsbn: lineB[3].isbn, fromVolume: '4', status: 'following' });
    expect(screen.getByText('Dark Horse · English')).toBeTruthy();
    // Volumes 1 to 3 stay in line A (Volume 2 still missing); 4 and 5 come from line B.
    await waitFor(() => expect([count('owned'), count('missing'), count('next')]).toEqual(['2', '1', '4']));
  });

  test('switching refuses a book of the same Edition Line, next to the field', async () => {
    const { follows } = await seriesPage('following');

    fireEvent.click(screen.getByRole('button', { name: 'Switch Edition Line' }));
    fireEvent.input(screen.getByLabelText('ISBN of the first Volume you collect in the new Edition Line'), { target: { value: lineA[3].isbn } });
    fireEvent.submit(screen.getByRole('button', { name: 'Switch' }).closest('form')!);

    expect(await screen.findByText('This book is already in your Edition Line.')).toBeTruthy();
    expect(follows()[0]).toMatchObject({ anchorIsbn: lineA[0].isbn });
  });

  test('a book of no Series says so', async () => {
    const { space } = memorySpace();
    const alone = volume(1, 'A', { series: null });
    render(<Series isbn={alone.isbn} sources={{ open: () => Promise.resolve(space), volumes: () => Promise.resolve([alone]), editions: () => Promise.resolve(new Map()) }} />);

    expect(await screen.findByText('The Catalog knows no Series for this book.')).toBeTruthy();
  });

  test('signed out: a link to Settings', async () => {
    render(<Series isbn={lineA[0].isbn} sources={{ open: () => Promise.resolve(undefined), volumes: () => Promise.resolve(undefined), editions: () => Promise.resolve(new Map()) }} />);

    expect(await screen.findByText('Sign in to see your Series.')).toBeTruthy();
  });
});
