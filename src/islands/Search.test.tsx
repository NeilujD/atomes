// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AuthorResult, AuthorWorks, EditionsFound, WorkResult } from '../lib/catalog/search';
import type { Library } from '../lib/library/model';
import { Search, type SearchProps, type Sources } from './Search';

const work: WorkResult = { id: 'wd:Q214132', also: [], title: 'Dix Petits Nègres', authors: ['Agatha Christie'], year: 1939, language: 'fr' };
const ilsEtaientDix = '9782253241782';
const french = [
  { isbn: ilsEtaientDix, title: 'Ils étaient dix', year: 2020, publisher: 'le Livre de poche', collection: 'Le livre de poche', language: 'fre' },
  { isbn: '9782253003960', title: 'Dix petits nègres', year: 1995, publisher: 'Librairie générale française', collection: null, language: 'fre' },
];
const english = [{ isbn: '9780062325549', title: 'And Then There Were None', year: 2011, publisher: 'HarperCollins', collection: null, language: 'eng' }];
const found: EditionsFound = { editions: [...french, ...english], noIsbn: 23, sections: [{ language: 'fr', matches: false, editions: french }] };
// "And Then There Were None", French preferred: French, then English apart.
const twoSections: EditionsFound = {
  ...found,
  sections: [
    { language: 'fr', matches: false, editions: french },
    { language: 'en', matches: true, editions: english },
  ],
};
const allLanguages: EditionsFound = { ...found, sections: [{ language: null, matches: false, editions: [...english, ...french] }] };

function screenWith(sources: Partial<Sources> = {}, props: Partial<SearchProps> = {}) {
  const calls = { words: [] as string[], picked: [] as string[], scans: 0 };
  render(
    <Search
      sources={{
        find: () => Promise.resolve({ found: { works: [work], authors: [] } }),
        editions: () => Promise.resolve({ found }),
        authorWorks: () => Promise.resolve({ found: { works: [], total: 0 } }),
        ...sources,
      }}
      onWords={(words) => calls.words.push(words)}
      onPick={(isbn) => {
        calls.picked.push(isbn);
        return Promise.resolve(undefined);
      }}
      onScan={() => calls.scans++}
      preferred="fr"
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

    const list = await screen.findByRole('list', { name: 'Français' });
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
    const find = vi.fn<Sources['find']>(() => Promise.resolve({ found: { works: [work], authors: [] } }));
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
    expect(screen.getByRole('list', { name: 'Français' })).toBeTruthy();
  });

  test('nothing found: says to check the spelling or try the author', async () => {
    screenWith({ find: () => Promise.resolve({ found: { works: [], authors: [] } }) });

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
      await screen.findByRole('list', { name: 'Français' });

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
              found: { works: [{ ...work, also: ['inv:9cc51ef9d8cd911a9eac07523f69232f'] }], authors: [] },
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
      await screen.findByRole('list', { name: 'Français' });
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

describe('Search mode: the Preferred Language (CORE-186)', () => {
  const titles = (list: HTMLElement) => within(list).getAllByRole('listitem').map((row) => row.querySelector('.search-title')?.textContent);
  const tags = (list: HTMLElement) => within(list).getAllByRole('listitem').map((row) => row.querySelector('.search-tag')?.textContent ?? null);

  test('asks the Editions in the Preferred Language, with the language of the words', async () => {
    const editions = vi.fn<Sources['editions']>(() => Promise.resolve({ found }));
    screenWith({ editions });

    await openWork();

    await screen.findByRole('list', { name: 'Français' });
    expect(editions).toHaveBeenCalledWith(work, 'fr');
  });

  test('a title in another language: the Preferred Language first, then that language apart, each row tagged', async () => {
    screenWith({ editions: () => Promise.resolve({ found: twoSections }) });

    await openWork();

    const first = await screen.findByRole('list', { name: 'Français' });
    const second = screen.getByRole('list', { name: 'English · matches your search' });
    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['Français', 'English · matches your search']);
    expect(tags(first)).toEqual([null, null]);
    expect(titles(second)).toEqual(['And Then There Were None']);
    expect(tags(second)).toEqual(['English']);
  });

  test('"All languages": one list, a language tag on each row', async () => {
    screenWith({ editions: () => Promise.resolve({ found: allLanguages }) }, { preferred: 'all' });

    await openWork();

    const list = await screen.findByRole('list', { name: 'Editions' });
    expect(tags(list)).toEqual(['English', 'French', 'French']);
    expect(screen.queryAllByRole('heading', { level: 3 })).toEqual([]);
  });

  test('no Edition in the Preferred Language: says so', async () => {
    screenWith({ editions: () => Promise.resolve({ found: { ...found, sections: [{ language: 'fr', matches: false, editions: [] }] } }) });

    await openWork();

    expect(await screen.findByText('No Edition in this language. Choose another Preferred Language in Settings.')).toBeTruthy();
  });

  test('a change of the setting changes the list', async () => {
    const editions = vi.fn<Sources['editions']>((_, language) => Promise.resolve({ found: language === 'all' ? allLanguages : found }));
    screenWith({ editions });
    await openWork();
    await screen.findByRole('list', { name: 'Français' });

    cleanup();
    screenWith({ editions }, { preferred: 'all' });
    await openWork();

    expect(tags(await screen.findByRole('list', { name: 'Editions' }))).toEqual(['English', 'French', 'French']);
    expect(editions).toHaveBeenLastCalledWith(work, 'all');
  });
});

const agatha: AuthorResult = { id: 'wd:Q35064', name: 'Agatha Christie', birthYear: 1890, works: 45 };
// Page `page` of her 45 Works: 20, 20, then 5.
const worksPage = (page: number): AuthorWorks => ({
  works: Array.from({ length: Math.min(20, 45 - (page - 1) * 20) }, (_, i) => ({
    id: `wd:Q${1000 + (page - 1) * 20 + i}`,
    also: [],
    title: `Work ${(page - 1) * 20 + i + 1}`,
    authors: ['Agatha Christie'],
    year: 2000 - (page - 1) * 20 - i,
    language: null,
  })),
  total: 45,
});

describe('Search mode: Authors (CORE-188)', () => {
  test('an Author row opens their Works, 20 at a time; Show more adds 20, until all show', async () => {
    const authorWorks = vi.fn<Sources['authorWorks']>((_, page) => Promise.resolve({ found: worksPage(page) }));
    screenWith({ find: () => Promise.resolve({ found: { works: [work], authors: [agatha] } }), authorWorks });

    searchFor('Agatha Christie');
    fireEvent.click(await screen.findByRole('button', { name: 'Agatha Christie · 45 Works' }));

    const list = await screen.findByRole('list', { name: 'Works' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(20);
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    await vi.waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(40));
    expect(within(list).getAllByRole('listitem')[20].textContent).toContain('Work 21');
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    await vi.waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(45));
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
    expect(authorWorks.mock.calls.map(([author, page]) => [author.id, page])).toEqual([
      ['wd:Q35064', 1],
      ['wd:Q35064', 2],
      ['wd:Q35064', 3],
    ]);
  });

  test('a Work of an Author opens its Editions; Back goes to the Author, then to all results', async () => {
    const editions = vi.fn<Sources['editions']>(() => Promise.resolve({ found }));
    screenWith({ find: () => Promise.resolve({ found: { works: [], authors: [agatha] } }), editions, authorWorks: (_, page) => Promise.resolve({ found: worksPage(page) }) });

    searchFor('Agatha Christie');
    fireEvent.click(await screen.findByRole('button', { name: 'Agatha Christie · 45 Works' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Work 1(?!\d)/ }));

    expect(await screen.findByRole('list', { name: 'Français' })).toBeTruthy();
    expect(editions.mock.calls[0][0].id).toBe('wd:Q1000');
    fireEvent.click(screen.getByRole('button', { name: 'Agatha Christie' }));
    expect(await screen.findByRole('list', { name: 'Works' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'All results' }));
    expect(await screen.findByRole('button', { name: 'Agatha Christie · 45 Works' })).toBeTruthy();
  });

  test('two Authors with the same name show their birth years', async () => {
    const dumas = (id: string, birthYear: number | null, works: number): AuthorResult => ({ id, name: 'Alexandre Dumas', birthYear, works });
    screenWith({ find: () => Promise.resolve({ found: { works: [], authors: [dumas('wd:Q38337', 1802, 309), dumas('wd:Q169150', 1824, 11), dumas('inv:2c0e', null, 1)] } }) });

    searchFor('Alexandre Dumas');

    expect(await screen.findByRole('button', { name: 'Alexandre Dumas (1802) · 309 Works' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Alexandre Dumas (1824) · 11 Works' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Alexandre Dumas · 1 Work' })).toBeTruthy();
  });
});
