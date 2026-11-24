// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AuthorResult, AuthorWorks, EditionsFound, WorkResult } from '../lib/catalog/search';
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
    expect(screen.getByRole('list', { name: 'Editions' })).toBeTruthy();
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

    expect(await screen.findByRole('list', { name: 'Editions' })).toBeTruthy();
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
