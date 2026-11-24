// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { EditionsFound, WorkResult } from '../lib/catalog/search';
import type { Library } from '../lib/library/model';
import { Search, type SearchProps, type Sources } from './Search';

const work: WorkResult = { id: 'wd:Q214132', also: [], title: 'Dix Petits Nègres', authors: ['Agatha Christie'], year: 1939 };
const ilsEtaientDix = '9782253241782';
const found: EditionsFound = {
  editions: [
    { isbn: ilsEtaientDix, title: 'Ils étaient dix', year: 2020, publisher: 'le Livre de poche', collection: 'Le livre de poche', language: 'fre' },
    { isbn: '9782253003960', title: 'Dix petits nègres', year: 1995, publisher: 'Librairie générale française', collection: null, language: 'fre' },
  ],
  noIsbn: 23,
};

function screenWith(sources: Partial<Sources> = {}, props: Partial<SearchProps> = {}) {
  const calls = { words: [] as string[], picked: [] as string[], scans: 0 };
  render(
    <Search
      sources={{ find: () => Promise.resolve({ found: [work] }), editions: () => Promise.resolve({ found }), ...sources }}
      onWords={(words) => calls.words.push(words)}
      onPick={(isbn) => {
        calls.picked.push(isbn);
        return Promise.resolve(undefined);
      }}
      onScan={() => calls.scans++}
      {...props}
    />,
  );
  return calls;
}

const box = () => screen.getByLabelText<HTMLInputElement>('Title of the book');
function searchFor(words: string) {
  fireEvent.input(box(), { target: { value: words } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
}
async function openWork() {
  searchFor('Dix petits nègres');
  fireEvent.click(await screen.findByRole('button', { name: /^Dix Petits Nègres/ }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Search mode', () => {
  test('opens a Work: its Editions, and how many have no ISBN', async () => {
    screenWith();

    await openWork();

    const list = await screen.findByRole('list', { name: 'Editions' });
    expect(within(list).getAllByRole('listitem').map((row) => row.querySelector('.search-title')?.textContent)).toEqual([
      'Ils étaient dix',
      'Dix petits nègres',
    ]);
    expect(screen.getByText('23 Editions with no ISBN are not shown.')).toBeTruthy();
  });

  test('each search gives its words, for the address', async () => {
    const calls = screenWith();

    searchFor('  Dix petits nègres ');

    expect(await screen.findByRole('button', { name: /^Dix Petits Nègres/ })).toBeTruthy();
    expect(calls.words).toEqual(['Dix petits nègres']);
  });

  test('the words of the address are searched at once: a reload keeps the results', async () => {
    const find = vi.fn<Sources['find']>(() => Promise.resolve({ found: [work] }));
    screenWith({ find }, { words: 'dix petits' });

    expect(await screen.findByRole('button', { name: /^Dix Petits Nègres/ })).toBeTruthy();
    expect(box().value).toBe('dix petits');
    expect(find).toHaveBeenCalledWith('dix petits');
  });

  test('a picked Edition goes to the page, which shows its Shelf Check answer', async () => {
    const calls = screenWith();

    await openWork();
    fireEvent.click(await screen.findByRole('button', { name: /^Ils étaient dix/ }));

    expect(calls.picked).toEqual([ilsEtaientDix]);
  });

  test('a pick the page cannot answer says why, and the Editions stay', async () => {
    screenWith({}, { onPick: () => Promise.resolve('The book sources do not answer now.') });

    await openWork();
    fireEvent.click(await screen.findByRole('button', { name: /^Ils étaient dix/ }));

    expect(await screen.findByText('The book sources do not answer now.')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Editions' })).toBeTruthy();
  });

  test('nothing found: says to check the spelling or try the author', async () => {
    screenWith({ find: () => Promise.resolve({ found: [] }) });

    searchFor('Dix petis negres');

    expect(await screen.findByText('No Work found. Check the spelling, or try the author’s name.')).toBeTruthy();
  });

  test('with no network: Search needs a connection, the words stay, and Scan is offered', async () => {
    const calls = screenWith({ find: () => Promise.reject(new TypeError('Failed to fetch')) });

    searchFor('Dix petits nègres');

    expect(await screen.findByText(/^Search needs a connection/)).toBeTruthy();
    expect(box().value).toBe('Dix petits nègres');
    fireEvent.click(screen.getByRole('button', { name: 'Scan the barcode' }));
    expect(calls.scans).toBe(1);
  });

  test('offline before it asks: no request, the same message', async () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    const find = vi.fn<Sources['find']>();
    screenWith({ find });

    searchFor('Dix petits nègres');

    expect(await screen.findByText(/^Search needs a connection/)).toBeTruthy();
    expect(find).not.toHaveBeenCalled();
    expect(box().value).toBe('Dix petits nègres');
    expect(screen.getByRole('button', { name: 'Scan the barcode' })).toBeTruthy();
  });

  test('sources down: no Scan button, a scan would not help', async () => {
    screenWith({ find: () => Promise.resolve({ unavailable: true }) });

    searchFor('Dix petits nègres');

    expect(await screen.findByText(/book sources/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Scan the barcode' })).toBeNull();
  });
  describe('marks from the Library on this device', () => {
    const empty: Library = {
      copies: [],
      readingStatuses: [],
      follows: [],
      loans: [],
      toBuy: [],
    };
    const createdAt = '2026-11-01T00:00:00.000Z';
    const editionRow = (isbn: string) => screen.getByText(`ISBN ${isbn}`).closest('li')!;

    test('an owned Edition shows In Library, an Edition on To Buy shows On To Buy, another shows none', async () => {
      const library: Library = {
        ...empty,
        copies: [
          {
            rkey: 'c1',
            value: { isbn: ilsEtaientDix, works: [work.id], createdAt },
          },
        ],
      };
      screenWith({}, { marks: { library, toBuy: new Set(['9782253003960']) } });

      await openWork();
      await screen.findByRole('list', { name: 'Editions' });

      expect(within(editionRow(ilsEtaientDix)).getByText('In Library')).toBeTruthy();
      expect(within(editionRow('9782253003960')).getByText('On To Buy')).toBeTruthy();
      expect(within(editionRow(ilsEtaientDix)).queryByText('On To Buy')).toBeNull();
    });

    test('a Work row has the Work mark: owned in any Edition, under any of its identifiers', async () => {
      const library: Library = {
        ...empty,
        copies: [
          {
            rkey: 'c1',
            value: {
              isbn: '9782253017097',
              works: ['inv:9cc51ef9d8cd911a9eac07523f69232f'],
              createdAt,
            },
          },
        ],
      };
      screenWith(
        {
          find: () =>
            Promise.resolve({
              found: [{ ...work, also: ['inv:9cc51ef9d8cd911a9eac07523f69232f'] }],
            }),
        },
        { marks: { library, toBuy: new Set() } },
      );

      searchFor('Dix petits nègres');

      const row = await screen.findByRole('button', {
        name: /^Dix Petits Nègres/,
      });
      expect(within(row).getByText('Already in your Library')).toBeTruthy();
    });

    test('a read Work shows the read mark, whatever the Edition, on its row and over its Editions', async () => {
      const library: Library = {
        ...empty,
        readingStatuses: [
          {
            rkey: work.id,
            value: {
              work: work.id,
              isbn: '9782253017097',
              status: 'read',
              updatedAt: createdAt,
            },
          },
        ],
      };
      screenWith({}, { marks: { library, toBuy: new Set() } });

      searchFor('Dix petits nègres');
      const row = await screen.findByRole('button', {
        name: /^Dix Petits Nègres/,
      });
      expect(within(row).getByText('Read, not in your Library')).toBeTruthy();

      fireEvent.click(row);
      await screen.findByRole('list', { name: 'Editions' });
      expect(screen.getByText('Read, not in your Library')).toBeTruthy();
      expect(within(editionRow(ilsEtaientDix)).queryByText('In Library')).toBeNull();
    });

    test('a Work neither owned nor read has no mark', async () => {
      screenWith({}, { marks: { library: empty, toBuy: new Set() } });

      searchFor('Dix petits nègres');

      const row = await screen.findByRole('button', {
        name: /^Dix Petits Nègres/,
      });
      expect(row.querySelector('.search-mark')).toBeNull();
    });
  });
});
