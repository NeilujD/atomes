// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, test } from 'vitest';
import type { Edition } from '../lib/catalog/catalog';
import { saveCopy } from '../lib/library/copy';
import { memorySpace } from '../lib/library/memory-space.fake';
import { saveReadingStatus, type Status } from '../lib/library/reading-status';
import { Home, type Sources } from './Home';

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
const asterix = edition('9782864976165', 'Astérix');
const fondation = edition('9782070360536', 'Fondation');
const catalog = [dune, horde, asterix, fondation];

// The reader owns `owned`, added one day apart in this order, and gives `statuses` to some Works.
async function homeScreen(owned: Edition[], statuses: [Edition, Status][] = []) {
  const { space } = memorySpace();
  for (const [day, each] of owned.entries()) await saveCopy(space, { isbn: each.isbn, works: [each.work.id], createdAt: `2026-11-0${day + 1}T00:00:00.000Z` });
  for (const [each, status] of statuses) await saveReadingStatus(space, { work: each.work.id, isbn: each.isbn, status, updatedAt: '2026-11-09T00:00:00.000Z' });
  const sources: Sources = {
    open: () => Promise.resolve(space),
    editions: (isbns) => Promise.resolve(new Map(catalog.filter((each) => isbns.includes(each.isbn)).map((each) => [each.isbn, each]))),
  };
  render(<Home sources={sources} />);
}

const titlesIn = (region: HTMLElement) => within(region).getAllByRole('link').map((link) => link.querySelector('.home-book-title')?.textContent);

afterEach(cleanup);

describe('Home screen', () => {
  test('a reader with three Owned-Unread books sees them, the last added first, each opening its Book page', async () => {
    await homeScreen([dune, horde, asterix]);

    const section = await screen.findByRole('region', { name: 'Owned, not read yet' });
    expect(titlesIn(section)).toEqual(['Astérix', 'La Horde du Contrevent', 'Dune']);
    expect(within(section).getByRole('link', { name: 'Dune' }).getAttribute('href')).toBe('/book?work=wd%3AQ320481');
  });

  test('a section with nothing to show is hidden: no book being read, no Reading now', async () => {
    await homeScreen([dune]);

    await screen.findByRole('region', { name: 'Owned, not read yet' });
    expect(screen.queryByRole('region', { name: 'Reading now' })).toBeNull();
    expect(screen.queryByText('New & upcoming')).toBeNull();
  });

  test('Owned-Unread comes first, then Reading now', async () => {
    await homeScreen([dune, horde], [[horde, 'reading'], [fondation, 'reading']]);

    const regions = await screen.findAllByRole('region');
    expect(regions.map((region) => within(region).getByRole('heading').textContent)).toEqual(['Owned, not read yet', 'Reading now']);
    expect(titlesIn(regions[0])).toEqual(['Dune']);
    expect(titlesIn(regions[1])).toEqual(['Fondation', 'La Horde du Contrevent']);
  });

  test('every section empty: a card with Check a book, the main action, no empty section', async () => {
    await homeScreen([dune], [[dune, 'read']]);

    const link = await screen.findByRole('link', { name: 'Check a book' });
    expect(link.getAttribute('href')).toBe('/check');
    expect(screen.queryAllByRole('region')).toEqual([]);
    expect(screen.queryAllByRole('heading')).toEqual([]);
  });
});
