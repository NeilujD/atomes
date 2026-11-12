// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, test } from 'vitest';
import type { Edition } from '../lib/catalog/catalog';
import { copyCollection, saveCopy, type Copy } from '../lib/library/copy';
import { followCollection, saveFollow, type Follow } from '../lib/library/follow';
import { memorySpace } from '../lib/library/memory-space.fake';
import { bookHref } from '../lib/library/model';
import { readingStatusCollection, saveReadingStatus, type ReadingStatus } from '../lib/library/reading-status';
import { Series, type Sources } from './Series';

const blacksad = { id: 'wd:Q1000001', title: 'Blacksad', sameAs: [] };

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
  volumes: [n],
  volume: n,
  sources: ['BnF'],
  fetchedAt: '2026-11-06T10:00:00.000Z',
  ...change,
});
const lineA = [1, 2, 3, 4, 5].map((n) => volume(n, 'A'));
const lineB = [1, 2, 3, 4, 5].map((n) => volume(n, 'B'));
const all = [...lineA, ...lineB];

// The reader owns Volumes 1 and 3 of line A and read Volume 1; `follow` says how they follow Blacksad,
// in a record saved under `followed`. `lines` are the Edition Lines the Catalog answers.
async function seriesPage(follow?: Follow['status'], editions: Edition[] = all, followed = blacksad.id, lines = [lineA, lineB]) {
  const { space, stored } = memorySpace();
  if (follow) await saveFollow(space, { series: followed, anchorIsbn: lineA[0].isbn, status: follow, updatedAt: '2026-11-06T11:00:00.000Z' });
  for (const n of [1, 3]) await saveCopy(space, { isbn: lineA[n - 1].isbn, works: [lineA[n - 1].work.id], createdAt: '2026-11-06T11:00:00.000Z' });
  await saveReadingStatus(space, { work: lineA[0].work.id, isbn: lineA[0].isbn, status: 'read', updatedAt: '2026-11-07T10:00:00.000Z' });
  const sources: Sources = {
    open: () => Promise.resolve(space),
    volumes: (each) => Promise.resolve(lines.find((line) => line.some(({ isbn: one }) => one === each))),
    editions: (isbns) => Promise.resolve(new Map(editions.filter(({ isbn: one }) => isbns.includes(one)).map((each) => [each.isbn, each]))),
  };
  render(<Series isbn={lineA[2].isbn} sources={sources} />);
  await screen.findByRole('heading', { name: 'Blacksad' });
  return {
    follows: () => stored(followCollection).map(({ value }) => value as Follow),
    keys: () => stored(followCollection).map(({ rkey }) => rkey),
    copies: () => stored(copyCollection).map(({ value }) => value as Copy),
    statuses: () => stored(readingStatusCollection).map(({ value }) => value as ReadingStatus),
  };
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
});

describe('Series page of a follow saved under an older identifier (same_as, ADR 0010)', () => {
  // The Catalog minted this identifier first; it now answers wd:Q1000001, same as it.
  const minted = 'atomes:catalog.test:01M750SM80AX373XJ01DSVNDXC';
  const linked = { ...blacksad, sameAs: [minted] };
  const linkedLines = [lineA, lineB].map((line) => line.map((each) => ({ ...each, series: linked })));

  test('the Series shows as followed, and dropping it changes the same record', async () => {
    const { follows, keys } = await seriesPage('following', linkedLines.flat(), minted, linkedLines);

    expect(screen.getByText('Following')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stop following' }));
    await screen.findByText('Dropped');

    expect(keys()).toEqual([minted]);
    expect(follows()).toEqual([expect.objectContaining({ series: minted, status: 'dropped' })]);
  });
});

describe('Volume sheet', () => {
  const sheet = () => within(screen.getByRole('dialog'));
  const spine = (name: string) => screen.getByRole('button', { name });

  test('each spine is a button that opens the Volume sheet: cover, title, Volume number, state, actions', async () => {
    await seriesPage('following');

    fireEvent.click(spine('Volume 2: not owned'));

    expect(sheet().getByRole('heading', { name: 'Blacksad' })).toBeTruthy();
    expect(sheet().getByText('Volume 2', { selector: 'p' })).toBeTruthy();
    expect(sheet().getByText('Not owned')).toBeTruthy();
    expect(sheet().getByRole('button', { name: 'I bought it' })).toBeTruthy();
    expect(sheet().getByRole('button', { name: 'Mark read' })).toBeTruthy();
    expect(sheet().getByRole('link', { name: 'Open' }).getAttribute('href')).toBe(bookHref(lineA[1].work.id));
  });

  test('"I bought it" saves one Copy of the Volume and the spine turns owned', async () => {
    const { copies } = await seriesPage('following');

    fireEvent.click(spine('Volume 2: not owned'));
    fireEvent.click(sheet().getByRole('button', { name: 'I bought it' }));

    await waitFor(() => expect(spine('Volume 2: owned, not read')).toBeTruthy());
    expect(copies().filter(({ isbn: one }) => one === lineA[1].isbn)).toEqual([expect.objectContaining({ works: [lineA[1].work.id] })]);
    expect(copies()).toHaveLength(3);
    // Owned now: no second Copy from the same sheet.
    expect(sheet().queryByRole('button', { name: 'I bought it' })).toBeNull();
    expect(sheet().getByText('Owned, not read')).toBeTruthy();
  });

  test('"Mark read" saves a Reading Status for the Work of the Volume, and the spine turns read', async () => {
    const { statuses } = await seriesPage('following');

    fireEvent.click(spine('Volume 3: owned, not read'));
    fireEvent.click(sheet().getByRole('button', { name: 'Mark read' }));

    await waitFor(() => expect(spine('Volume 3: read')).toBeTruthy());
    expect(statuses()).toContainEqual(expect.objectContaining({ work: lineA[2].work.id, isbn: lineA[2].isbn, status: 'read' }));
    expect(sheet().queryByRole('button', { name: 'Mark read' })).toBeNull();
  });

  test('marking a Volume of a Series not followed yet read follows it', async () => {
    const { follows } = await seriesPage();

    fireEvent.click(spine('Volume 2: not owned'));
    fireEvent.click(sheet().getByRole('button', { name: 'Mark read' }));

    await screen.findByText('Following');
    expect(follows()).toEqual([expect.objectContaining({ series: blacksad.id, anchorIsbn: lineA[1].isbn, status: 'following' })]);
  });

  // A modal <dialog>: the browser closes it on Escape (happy-dom does not; checked in a browser).
  test('the sheet is modal; Close and a tap on the backdrop close it', async () => {
    await seriesPage('following');
    const dialog = screen.getByRole<HTMLDialogElement>('dialog', { hidden: true });

    fireEvent.click(spine('Volume 2: not owned'));
    expect(dialog.open).toBe(true);
    fireEvent.click(sheet().getByRole('button', { name: 'Close' }));
    expect(dialog.open).toBe(false);

    fireEvent.click(spine('Volume 4: not owned'));
    expect(sheet().getByText('Volume 4', { selector: 'p' })).toBeTruthy();
    fireEvent.click(dialog);
    expect(dialog.open).toBe(false);
  });
});
