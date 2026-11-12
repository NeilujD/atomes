// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, test } from 'vitest';
import type { Edition } from '../lib/catalog/catalog';
import { saveCopy } from '../lib/library/copy';
import { memorySpace } from '../lib/library/memory-space.fake';
import { saveReadingStatus } from '../lib/library/reading-status';
import { groupingKey } from '../lib/library/series-mode';
import { Library, type Sources } from './Library';

const edition = (isbn: string, title: string, authors: string[]): Edition => ({
  isbn,
  title,
  volumeTitle: null,
  authors,
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
const books = [
  edition('9782864976165', 'Astérix', ['Fabcaro']),
  edition('9782266320481', 'Dune', ['Frank Herbert']),
  edition('9782070464234', 'La Horde du Contrevent', ['Alain Damasio']),
];

// The reader owns the three books and has read Dune.
async function libraryScreen(owned = books) {
  const { space } = memorySpace();
  for (const each of owned) await saveCopy(space, { isbn: each.isbn, works: [each.work.id], createdAt: '2026-11-01T00:00:00.000Z' });
  await saveReadingStatus(space, { work: books[1].work.id, isbn: books[1].isbn, status: 'read', updatedAt: '2026-11-02T00:00:00.000Z' });
  const sources: Sources = {
    open: () => Promise.resolve(space),
    editions: (isbns) => Promise.resolve(new Map(owned.filter((each) => isbns.includes(each.isbn)).map((each) => [each.isbn, each]))),
  };
  render(<Library sources={sources} />);
  await screen.findByRole('list');
}

const titles = () => within(screen.getByRole('list')).getAllByRole('link').map((link) => link.querySelector('.library-book-title')?.textContent);

afterEach(() => {
  cleanup();
  localStorage.removeItem(groupingKey);
});

describe('Library screen', () => {
  test('shows every book A to Z, each linking to its Book page', async () => {
    await libraryScreen();

    expect(titles()).toEqual(['Astérix', 'Dune', 'La Horde du Contrevent']);
    expect(screen.getAllByRole('link', { name: /Dune/ })[0].getAttribute('href')).toBe('/book?work=wd%3AQ320481');
    expect(screen.getByText('3 books')).toBeTruthy();
  });

  test('a search without accents narrows the grid and the count; Clear all brings every book back', async () => {
    await libraryScreen();
    fireEvent.input(screen.getByRole('searchbox', { name: 'Search your Library' }), { target: { value: 'asterix' } });

    expect(titles()).toEqual(['Astérix']);
    expect(screen.getByText('1 of 3 books')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Clear all' })[0]);

    expect(titles()).toEqual(['Astérix', 'Dune', 'La Horde du Contrevent']);
    expect(screen.getByRole<HTMLInputElement>('searchbox').value).toBe('');
  });

  test('a search that finds nothing says so and offers Clear all', async () => {
    await libraryScreen();
    fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'zzz' } });

    expect(screen.getByText('No book matches these filters.')).toBeTruthy();
  });

  test('Series mode shows one card per Series, opening its Series page, and is still on after a reload', async () => {
    const onePiece = { id: 'wd:Q673', title: 'One Piece', sameAs: [] };
    const volumes = ['9782723434621', '9782723434638'].map((isbn, index) => ({ ...edition(isbn, 'One Piece', ['Eiichirō Oda']), series: onePiece, volumes: [index + 1], volume: index + 1 }));
    await libraryScreen([...books, ...volumes]);
    fireEvent.click(screen.getByRole('radio', { name: 'Series' }));

    expect(titles()).toEqual(['Astérix', 'Dune', 'La Horde du Contrevent', 'One Piece']);
    expect(screen.getByRole('link', { name: /One Piece/ }).getAttribute('href')).toBe('/series?isbn=9782723434621');

    // A reload: the screen starts again, on the same device.
    cleanup();
    await libraryScreen([...books, ...volumes]);

    expect(titles()).toEqual(['Astérix', 'Dune', 'La Horde du Contrevent', 'One Piece']);
  });
});
