// @vitest-environment happy-dom
// The Statistics screen (ADR 0019): the numbers of stats.ts, the period and
// the filters in the URL, the foot line and the empty state. "Today" is
// 18 November 2026 on the device.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Edition } from '../lib/catalog/catalog';
import { saveCopy } from '../lib/library/copy';
import { saveLabel } from '../lib/library/label';
import { memorySpace } from '../lib/library/memory-space.fake';
import { saveReadingStatus } from '../lib/library/reading-status';
import { Statistics, type Sources } from './Statistics';

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
const catalog = [dune, horde, fondation];
const day = (date: string) => `${date}T00:00:00.000Z`;

// The reader owns `owned` (got on 2 November 2026), and has read `read`
// (finished on the day given, or with no day).
async function statisticsScreen({ owned = [], read = [], labels = [] }: { owned?: Edition[]; read?: [Edition, string?][]; labels?: [string, Edition[]][] }) {
  const { space } = memorySpace();
  for (const each of owned) await saveCopy(space, { isbn: each.isbn, works: [each.work.id], acquiredAt: day('2026-11-02'), createdAt: '2026-11-02T10:00:00.000Z' });
  for (const [each, finished] of read) {
    await saveReadingStatus(space, { work: each.work.id, isbn: each.isbn, status: 'read', ...(finished && { finishedAt: day(finished) }), updatedAt: '2026-11-09T00:00:00.000Z' });
  }
  for (const [name, works] of labels) await saveLabel(space, { name, works: works.map(({ work }) => work.id), createdAt: '2026-01-01T00:00:00.000Z' }, `lb${name.toLowerCase()}`);
  const sources: Sources = {
    open: () => Promise.resolve(space),
    editions: (isbns) => Promise.resolve(new Map(catalog.filter((each) => isbns.includes(each.isbn)).map((each) => [each.isbn, each]))),
  };
  render(<Statistics sources={sources} />);
}

const periods = (name = 'Period') => screen.getByRole('group', { name });
// The lead number and its period, one line in two spans: "1 read in 2026".
const lead = (text: string) => screen.findByText((_, element) => element?.tagName === 'P' && element.textContent === text);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 18, 9, 30));
  document.documentElement.lang = 'en';
  history.replaceState(null, '', '/statistics');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Statistics screen', () => {
  test('a read finished this month: the lead number of the year, its tiles, and the column of November', async () => {
    await statisticsScreen({ owned: [dune, horde], read: [[dune, '2026-11-17']] });

    await lead('1 read in 2026');
    expect(screen.getAllByRole('term').slice(0, 3).map((each) => each.textContent)).toEqual(['Added', 'Reading', 'Owned, not read yet']);
    expect(screen.getAllByRole('definition').slice(0, 3).map((each) => each.textContent)).toEqual(['2', '0', '1']);
    expect(screen.getByRole('button', { name: 'November 2026: Read 1, Added 2' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(periods()).getByRole('button', { name: '2026' }).getAttribute('aria-pressed')).toBe('true');
  });

  test('a read with no date counts in All time and in the foot line, never in a year; All time goes in the URL', async () => {
    await statisticsScreen({ owned: [dune], read: [[dune, '2026-11-17'], [horde]] });

    await lead('1 read in 2026');
    expect(screen.getByText('1 book read has no date. It counts in the totals, not by month.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Add dates' }).getAttribute('href')).toBe('/library');

    fireEvent.click(within(periods()).getByRole('button', { name: 'All time' }));
    await lead('2 read in all');
    expect(location.search).toBe('?period=all');
    expect(screen.getByRole('heading', { name: 'Read and added, by year' })).toBeTruthy();
  });

  test('Back puts the earlier period and Label back', async () => {
    await statisticsScreen({ owned: [dune], read: [[dune, '2026-11-17'], [fondation, '2025-03-01']], labels: [['SF', [fondation]]] });
    await lead('1 read in 2026');

    fireEvent.click(within(periods()).getByRole('button', { name: '2025' }));
    // The Label chips: in the toolbar on desktop, in the Filter sheet on the phone.
    fireEvent.click(within(screen.getAllByRole('group', { name: 'Label' })[0]).getByRole('button', { name: 'SF' }));
    expect(location.search).toBe('?period=2025&label=lbsf');
    await lead('1 read in 2025');

    history.back();
    await waitFor(() => expect(location.search).toBe('?period=2025'));
    await waitFor(() => expect(within(periods()).getByRole('button', { name: '2025' }).getAttribute('aria-pressed')).toBe('true'));
    expect(within(screen.getAllByRole('group', { name: 'Label' })[0]).getByRole('button', { name: 'SF' }).getAttribute('aria-pressed')).toBe('false');
  });

  test('a Label keeps its books only; the Filter button says how many filters are on', async () => {
    history.replaceState(null, '', '/statistics?period=2026&label=lbsf&owned=1');
    await statisticsScreen({ owned: [dune], read: [[dune, '2026-11-17'], [horde, '2026-10-01']], labels: [['SF', [dune, horde]]] });

    // Owned only: Horde, read and not owned, is out.
    await lead('1 read in 2026');
    expect(screen.getByRole('button', { name: /Filter/ }).textContent).toContain('2');
  });

  test('no read has a day: the totals, how to add days, and no chart by time', async () => {
    await statisticsScreen({ owned: [dune], read: [[horde]] });

    expect(await screen.findByText(/No book read has a finish day yet/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Read and added/ })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Most read' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Your Library today' })).toBeTruthy();
  });

  test('in French: the period, the month names and the numbers follow the page language', async () => {
    document.documentElement.lang = 'fr';
    await statisticsScreen({ owned: [dune, horde], read: [[dune, '2026-11-17']] });

    await lead('1 lu en 2026');
    expect(within(periods('Période')).getByRole('button', { name: 'Depuis toujours' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'novembre 2026 : Lus 1, Ajoutés 2' })).toBeTruthy();
  });
});
