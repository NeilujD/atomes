// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, test } from 'vitest';
import type { Edition } from '../lib/catalog/catalog';
import { saveCopy } from '../lib/library/copy';
import { memorySpace } from '../lib/library/memory-space.fake';
import { saveReadingStatus } from '../lib/library/reading-status';
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

// Two Volumes of one Series.
const onePiece = { id: 'wd:Q673', title: 'One Piece', sameAs: [] };
const volumes = ['9782723434621', '9782723434638'].map((isbn, index) => ({ ...edition(isbn, 'One Piece', ['Eiichirō Oda']), series: onePiece, volumes: [index + 1], volume: index + 1 }));

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
  await screen.findAllByRole('list');
}

const titles = () => within(screen.getByRole('list')).getAllByRole('link').map((link) => link.querySelector('.library-book-title')?.textContent);

afterEach(() => {
  cleanup();
  localStorage.clear();
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

const headings = () => screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
const choose = (mode: string) => fireEvent.click(screen.getByRole('radio', { name: mode }));

describe('Library modes', () => {
  test('List puts the books under their letters, each linking to its Book page; Grid brings the grid back', async () => {
    await libraryScreen();
    choose('List');

    expect(headings()).toEqual(['A', 'D', 'L']);
    expect(within(screen.getByRole('region', { name: 'D' })).getByRole('link', { name: /Dune/ }).getAttribute('href')).toBe('/book?work=wd%3AQ320481');

    choose('Grid');

    expect(screen.queryAllByRole('heading', { level: 2 })).toEqual([]);
    expect(titles()).toEqual(['Astérix', 'Dune', 'La Horde du Contrevent']);
  });

  test('the index of List jumps to a letter: the focus moves to its group; a letter with no book is off', async () => {
    await libraryScreen();
    choose('List');
    const index = within(screen.getByRole('navigation', { name: 'Jump to a letter' }));
    fireEvent.click(index.getByRole('button', { name: 'L' }));

    expect(document.activeElement).toBe(screen.getByRole('region', { name: 'L' }));
    expect(index.getByRole<HTMLButtonElement>('button', { name: 'B' }).disabled).toBe(true);
  });

  test('the mode is kept on this device: the next visit opens in it; a kept value that is no mode opens the Grid', async () => {
    await libraryScreen();
    choose('List');
    cleanup();
    await libraryScreen();

    expect(headings()).toEqual(['A', 'D', 'L']);

    cleanup();
    localStorage.setItem('atomes:library-mode', 'shelf');
    await libraryScreen();

    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Grid' }).checked).toBe(true);
    expect(titles()).toEqual(['Astérix', 'Dune', 'La Horde du Contrevent']);
  });

  test('sorted by "Recently added", List is one group with no index', async () => {
    await libraryScreen();
    choose('List');
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'added' } });

    expect(headings()).toEqual(['Recently added']);
    expect(screen.queryByRole('navigation', { name: 'Jump to a letter' })).toBeNull();
  });
});

describe('Cover flow', () => {
  // The cover in front.
  const current = () => screen.getByRole('link', { current: true }).getAttribute('aria-label');
  const slider = () => screen.getByRole<HTMLInputElement>('slider', { name: 'Browse your Library' });

  test('starts on the book in the middle', async () => {
    await libraryScreen();
    choose('Cover flow');

    expect(current()).toBe('Dune');
    expect(screen.getByText('2 of 3')).toBeTruthy();
    expect(slider().value).toBe('2');
  });

  test('Next and Previous move one book, the slider follows, and each stops at its end', async () => {
    await libraryScreen();
    choose('Cover flow');
    const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
    press('Next');

    expect([current(), slider().value]).toEqual(['La Horde du Contrevent', '3']);
    expect(screen.getByText('3 of 3')).toBeTruthy();

    press('Next');

    expect(current()).toBe('La Horde du Contrevent');

    press('Previous');
    press('Previous');
    press('Previous');

    expect([current(), slider().value]).toEqual(['Astérix', '1']);
  });

  test('the slider goes straight to a book', async () => {
    await libraryScreen();
    choose('Cover flow');
    fireEvent.input(slider(), { target: { value: '3' } });

    expect(current()).toBe('La Horde du Contrevent');
    expect(screen.getByText('3 of 3')).toBeTruthy();
  });

  test('a cover on the side comes to the front when chosen; in front, it links to its Book page', async () => {
    await libraryScreen();
    choose('Cover flow');
    fireEvent.click(screen.getByRole('link', { name: 'Astérix' }));

    expect([current(), slider().value]).toEqual(['Astérix', '1']);
    expect(screen.getByRole('link', { current: true }).getAttribute('href')).toBe('/book?work=wd%3AQ976165');
  });

  test('a search starts again in the middle of the books it finds', async () => {
    await libraryScreen();
    choose('Cover flow');
    fireEvent.input(slider(), { target: { value: '1' } });
    fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'd' } });

    expect(current()).toBe('La Horde du Contrevent');
    expect(screen.getByText('2 of 2')).toBeTruthy();
  });
});
