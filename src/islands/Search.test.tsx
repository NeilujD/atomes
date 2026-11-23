// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Edition } from '../lib/catalog/catalog';
import type { EditionsFound, WorkResult } from '../lib/catalog/search';
import { saveCopy } from '../lib/library/copy';
import { memorySpace } from '../lib/library/memory-space.fake';
import { saveToBuy, toBuyCollection } from '../lib/library/to-buy';
import { Search, type Sources } from './Search';

const work: WorkResult = { id: 'wd:Q214132', also: [], title: 'Dix Petits Nègres', authors: ['Agatha Christie'], year: 1939 };
const ilsEtaientDix = '9782253241782';
const found: EditionsFound = {
  editions: [
    { isbn: ilsEtaientDix, title: 'Ils étaient dix', year: 2020, publisher: 'le Livre de poche', collection: 'Le livre de poche', language: 'fre' },
    { isbn: '9782253003960', title: 'Dix petits nègres', year: 1995, publisher: 'Librairie générale française', collection: null, language: 'fre' },
  ],
  noIsbn: 23,
};
// What the normal lookup gives for the picked ISBN: the Edition of the Work.
const edition = (isbn: string): Edition => ({
  isbn,
  title: 'Ils étaient dix',
  volumeTitle: null,
  authors: ['Agatha Christie'],
  publisher: 'le Livre de poche',
  language: 'fre',
  format: null,
  cover: null,
  work: { id: work.id, title: 'Ils étaient dix' },
  series: null,
  volumes: [],
  volume: null,
  sources: ['BnF', 'Inventaire'],
  fetchedAt: '2026-11-23T10:00:00.000Z',
});

function screenWith(overrides: Partial<Sources> = {}) {
  const { space, stored } = memorySpace();
  const sources: Sources = {
    find: () => Promise.resolve({ found: [work] }),
    editions: () => Promise.resolve({ found }),
    lookup: (isbn) => Promise.resolve({ found: edition(isbn) }),
    open: () => Promise.resolve(space),
    ...overrides,
  };
  render(<Search sources={sources} />);
  return { space, stored };
}

const box = () => screen.getByLabelText<HTMLInputElement>('Title of the book');
function searchFor(words: string) {
  fireEvent.input(box(), { target: { value: words } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
}
const isbnBox = () => screen.getByLabelText<HTMLInputElement>('Add a book by its ISBN');
function addByIsbn(typed: string) {
  fireEvent.input(isbnBox(), { target: { value: typed } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
}
async function pick(title: string) {
  searchFor('Dix petits nègres');
  fireEvent.click(await screen.findByRole('button', { name: /^Dix Petits Nègres/ }));
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${title}`) }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Search screen', () => {
  test('opens a Work: its Editions, and how many have no ISBN', async () => {
    screenWith();

    searchFor('Dix petits nègres');
    fireEvent.click(await screen.findByRole('button', { name: /^Dix Petits Nègres/ }));

    const list = await screen.findByRole('list', { name: 'Editions' });
    expect(within(list).getAllByRole('listitem').map((row) => row.querySelector('.search-title')?.textContent)).toEqual([
      'Ils étaient dix',
      'Dix petits nègres',
    ]);
    expect(screen.getByText('23 Editions with no ISBN are not shown.')).toBeTruthy();
  });

  test('a picked Edition added to To Buy is a To Buy record', async () => {
    const { stored } = screenWith();

    await pick('Ils étaient dix');
    fireEvent.click(screen.getByRole('button', { name: 'Add to To Buy' }));

    await vi.waitFor(() => expect(stored(toBuyCollection).map(({ rkey }) => rkey)).toEqual([ilsEtaientDix]));
  });

  test('an Edition of a Work the reader owns is refused, with the To Buy message', async () => {
    const { space, stored } = screenWith();
    // A Copy of another Edition of the same Work.
    await saveCopy(space, { isbn: '9782702449547', works: [work.id], createdAt: '2026-11-01T10:00:00.000Z' });

    await pick('Ils étaient dix');
    fireEvent.click(screen.getByRole('button', { name: 'Add to To Buy' }));

    expect(await screen.findByText('You already have this book.')).toBeTruthy();
    expect(stored(toBuyCollection)).toEqual([]);
  });

  test('an Edition already on To Buy is refused, with the To Buy message', async () => {
    const { space, stored } = screenWith();
    await saveToBuy(space, { isbn: ilsEtaientDix, createdAt: '2026-11-01T10:00:00.000Z' });

    await pick('Ils étaient dix');
    fireEvent.click(screen.getByRole('button', { name: 'Add to To Buy' }));

    expect(await screen.findByText('This book is already on your To Buy list.')).toBeTruthy();
    expect(stored(toBuyCollection)).toHaveLength(1);
  });

  test('with no network, says Search needs a connection and keeps the words', async () => {
    screenWith({ find: () => Promise.reject(new TypeError('Failed to fetch')) });

    searchFor('Dix petits nègres');

    expect(await screen.findByText(/^Search needs a connection/)).toBeTruthy();
    expect(box().value).toBe('Dix petits nègres');
  });

  test('offline before it asks: no request, the same message', async () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    const find = vi.fn<Sources['find']>();
    screenWith({ find });

    searchFor('Dix petits nègres');

    expect(await screen.findByText(/^Search needs a connection/)).toBeTruthy();
    expect(find).not.toHaveBeenCalled();
    expect(box().value).toBe('Dix petits nègres');
  });

  test('a typed ISBN is added to To Buy, and the field empties', async () => {
    const { stored } = screenWith({ lookup: () => Promise.resolve({ notFound: true }) });

    addByIsbn('978-2-505-00001-3');

    await vi.waitFor(() => expect(stored(toBuyCollection).map(({ rkey }) => rkey)).toEqual(['9782505000013']));
    await vi.waitFor(() => expect(isbnBox().value).toBe(''));
  });

  test('a typed ISBN is added with no network too: the record waits on the device', async () => {
    const { stored } = screenWith({ lookup: () => Promise.reject(new TypeError('Failed to fetch')) });

    addByIsbn('9782505000013');

    await vi.waitFor(() => expect(stored(toBuyCollection).map(({ rkey }) => rkey)).toEqual(['9782505000013']));
  });

  test('a typed ISBN of a book the reader owns, or a wrong ISBN, is refused next to the field', async () => {
    const { space, stored } = screenWith();
    await saveCopy(space, { isbn: ilsEtaientDix, works: [work.id], createdAt: '2026-11-01T10:00:00.000Z' });

    addByIsbn(ilsEtaientDix);
    expect(await screen.findByText('You already have this book.')).toBeTruthy();
    expect(isbnBox().getAttribute('aria-invalid')).toBe('true');

    addByIsbn('9782505000014');
    expect(await screen.findByText(/^One digit is wrong/)).toBeTruthy();
    expect(stored(toBuyCollection)).toEqual([]);
  });
});
