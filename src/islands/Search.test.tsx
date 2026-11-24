// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Edition } from '../lib/catalog/catalog';
import type { AuthorResult, AuthorWorks, EditionsFound, SeriesResult, VolumeResult, WorkResult } from '../lib/catalog/search';
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
        find: () => Promise.resolve({ found: { works: [work], authors: [], series: [] } }),
        editions: () => Promise.resolve({ found }),
        authorWorks: () => Promise.resolve({ found: { works: [], total: 0 } }),
        seriesVolumes: () => Promise.resolve({ found: { volumes: [] } }),
        line: () => Promise.resolve(undefined),
        onDevice: () => Promise.resolve(undefined),
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

const box = () => screen.getByLabelText<HTMLInputElement>('Title or author');
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
    const find = vi.fn<Sources['find']>(() => Promise.resolve({ found: { works: [work], authors: [], series: [] } }));
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
    screenWith({ find: () => Promise.resolve({ found: { works: [], authors: [], series: [] } }) });

    searchFor('Dix petis negres');

    expect(await screen.findByText('Nothing found for these words. Check the spelling, or try other words.')).toBeTruthy();
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

  describe('with no network, the books this device keeps', () => {
    const kept = [{ isbn: ilsEtaientDix, title: 'Ils étaient dix', year: 2020, publisher: 'le Livre de poche', collection: null, language: 'fre' }];

    test('offline: the matches of the device, and a tap gives their Shelf Check; nothing is asked', async () => {
      vi.stubGlobal('navigator', { ...navigator, onLine: false });
      const find = vi.fn<Sources['find']>();
      const editions = vi.fn<Sources['editions']>();
      const onDevice = vi.fn<Sources['onDevice']>(() => Promise.resolve(kept));
      const calls = screenWith({ find, editions, onDevice });

      searchFor('ils etaient');

      fireEvent.click(await screen.findByRole('button', { name: /^Ils étaient dix/ }));
      expect(screen.getByText('No connection: only the books kept on this device.')).toBeTruthy();
      expect(onDevice).toHaveBeenCalledWith('ils etaient');
      await vi.waitFor(() => expect(calls.picked).toEqual([ilsEtaientDix]));
      expect(find).not.toHaveBeenCalled();
      expect(editions).not.toHaveBeenCalled();
    });

    test('a weak signal: the search fails on its way, the device answers', async () => {
      screenWith({ find: () => Promise.reject(new TypeError('Failed to fetch')), onDevice: () => Promise.resolve(kept) });

      searchFor('ils etaient');

      expect(await screen.findByRole('button', { name: /^Ils étaient dix/ })).toBeTruthy();
    });

    test('no match after a match: the results of the words before go', async () => {
      vi.stubGlobal('navigator', { ...navigator, onLine: false });
      screenWith({ onDevice: (words) => Promise.resolve(words === 'ils etaient' ? kept : []) });

      searchFor('ils etaient');
      expect(await screen.findByRole('button', { name: /^Ils étaient dix/ })).toBeTruthy();
      searchFor('asterix');

      expect(await screen.findByText(/^Nothing on this device matches these words/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: /^Ils étaient dix/ })).toBeNull();
    });

    test('no match: not a sure answer, so the words stay and Scan is offered', async () => {
      vi.stubGlobal('navigator', { ...navigator, onLine: false });
      const calls = screenWith({ onDevice: () => Promise.resolve([]) });

      searchFor('Dix petits nègres');

      expect(await screen.findByText(/^Nothing on this device matches these words. The book can still be new/)).toBeTruthy();
      expect(screen.queryByText(/not in your Library/i)).toBeNull();
      expect(box().value).toBe('Dix petits nègres');
      fireEvent.click(screen.getByRole('button', { name: 'Scan the barcode' }));
      expect(calls.scans).toBe(1);
    });
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
              found: { works: [{ ...work, also: ['inv:9cc51ef9d8cd911a9eac07523f69232f'] }], authors: [], series: [] },
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
    screenWith({ find: () => Promise.resolve({ found: { works: [work], authors: [agatha], series: [] } }), authorWorks });

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
    screenWith({ find: () => Promise.resolve({ found: { works: [], authors: [agatha], series: [] } }), editions, authorWorks: (_, page) => Promise.resolve({ found: worksPage(page) }) });

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
    screenWith({ find: () => Promise.resolve({ found: { works: [], authors: [dumas('wd:Q38337', 1802, 309), dumas('wd:Q169150', 1824, 11), dumas('inv:2c0e', null, 1)], series: [] } }) });

    searchFor('Alexandre Dumas');

    expect(await screen.findByRole('button', { name: 'Alexandre Dumas (1802) · 309 Works' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Alexandre Dumas (1824) · 11 Works' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Alexandre Dumas · 1 Work' })).toBeTruthy();
  });
});

describe('Search mode: Series and Volumes (CORE-187)', () => {
  const dargaud = { publisher: 'Dargaud', first: 1982, last: 1984, language: 'fre' };
  const hachette = { publisher: 'Hachette', first: 2001, last: 2004, language: 'fre' };
  const asterix: SeriesResult = { id: 'wd:Q42490', title: 'Astérix', sameAs: [], lines: [dargaud, hachette] };
  const combatDesChefs: VolumeResult = { id: 'wd:Q1194700', number: 7, title: 'Le Combat des chefs' };
  const volumes: VolumeResult[] = [
    { id: 'wd:Q618719', number: 1, title: 'Astérix le Gaulois' },
    combatDesChefs,
    { id: 'inv:0b0b', number: 56, title: null },
    { id: 'wd:Q97188282', number: null, title: "Le Menhir d'or" },
  ];
  const hachette2005 = '9782012101395';
  const volume7 = [
    { isbn: hachette2005, title: 'Le combat des chefs', year: 2005, publisher: 'Hachette', collection: null, language: 'fre', volume: 7, volumeTitle: 'Le Combat des chefs', line: hachette },
    { isbn: '9782205001709', title: 'Le combat des chefs', year: 1984, publisher: 'Dargaud', collection: null, language: 'fre', volume: 7, volumeTitle: 'Le Combat des chefs', line: dargaud },
  ];
  const volume7Found: EditionsFound = { editions: volume7, noIsbn: 0, sections: [{ language: 'fr', matches: false, editions: volume7 }] };
  const findSeries = () => Promise.resolve({ found: { works: [], authors: [], series: [asterix] } });

  test('Series → Edition Line → Volume → its Editions in that line: the pick is that Edition', async () => {
    // English preferred: no English Edition, and the French Edition Line still shows its Editions.
    const editions = vi.fn<Sources['editions']>(() => Promise.resolve({ found: { ...volume7Found, sections: [{ language: 'en', matches: false, editions: [] }] } }));
    const calls = screenWith({ find: findSeries, seriesVolumes: () => Promise.resolve({ found: { volumes } }), editions }, { preferred: 'en' });

    searchFor('Astérix');
    fireEvent.click(await screen.findByRole('button', { name: /^Astérix/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^Hachette · 2001–2004/ }));
    fireEvent.click(await screen.findByRole('button', { name: '7 · Le Combat des chefs' }));

    // One list: the Edition Line has one language, whatever the Preferred Language.
    const list = await screen.findByRole('list', { name: 'Editions' });
    expect(editions.mock.calls[0][0].id).toBe(combatDesChefs.id);
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    fireEvent.click(within(list).getByRole('button', { name: /^Le combat des chefs/ }));
    expect(calls.picked).toEqual([hachette2005]);
  });

  test('a Volume shows its number and title, its number only, or its title only', async () => {
    screenWith({ find: findSeries, seriesVolumes: () => Promise.resolve({ found: { volumes } }) });

    searchFor('Astérix');
    fireEvent.click(await screen.findByRole('button', { name: /^Astérix/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^Dargaud/ }));

    const list = await screen.findByRole('list', { name: 'Volumes' });
    expect(within(list).getAllByRole('button').map((each) => each.textContent)).toEqual(['1 · Astérix le Gaulois', '7 · Le Combat des chefs', '56', "Le Menhir d'or"]);
  });

  test('Back goes from the Editions to the Volumes, to the Edition Lines, to all results', async () => {
    screenWith({ find: findSeries, seriesVolumes: () => Promise.resolve({ found: { volumes } }), editions: () => Promise.resolve({ found: volume7Found }) });

    searchFor('Astérix');
    fireEvent.click(await screen.findByRole('button', { name: /^Astérix/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^Hachette · 2001–2004/ }));
    fireEvent.click(await screen.findByRole('button', { name: '7 · Le Combat des chefs' }));
    await screen.findByRole('list', { name: 'Editions' });

    fireEvent.click(screen.getByRole('button', { name: 'Hachette · 2001–2004' }));
    expect(await screen.findByRole('list', { name: 'Volumes' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Astérix' }));
    expect(await screen.findByRole('list', { name: 'Edition Lines' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'All results' }));
    expect(await screen.findByRole('button', { name: /^Astérix/ })).toBeTruthy();
  });

  test('a Volume found by its title shows its Editions in every Edition Line, each with its Volume and Edition Line name', async () => {
    const volumeWork: WorkResult = { id: combatDesChefs.id, also: [], title: 'Le Combat des chefs', authors: ['René Goscinny'], year: 1966, language: 'fr' };
    screenWith({ find: () => Promise.resolve({ found: { works: [volumeWork], authors: [], series: [] } }), editions: () => Promise.resolve({ found: volume7Found }) });

    searchFor('Le Combat des chefs');
    fireEvent.click(await screen.findByRole('button', { name: /^Le Combat des chefs/ }));

    const list = await screen.findByRole('list', { name: 'Français' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('Volume 7 · Le Combat des chefs · Hachette · 2001–2004')).toBeTruthy();
    expect(within(list).getByText('Volume 7 · Le Combat des chefs · Dargaud · 1982–1984')).toBeTruthy();
  });

  // A follow keeps the identifier it was saved with: the Series row answers to its `sameAs` ones too.
  const minted = 'atomes:atomes.test:01JD5Z8X7Q9W3E4R5T6Y7V8M9N';
  test.each([
    { follow: asterix.id, row: asterix },
    { follow: minted, row: { ...asterix, sameAs: [minted] } },
  ])('a Series the reader follows as $follow shows their Shelf Check Series line', async ({ follow, row }) => {
    const anchor = '9782012100015';
    const inLine = (volume: number): Edition => ({
      isbn: `97820121000${String(volume).padStart(2, '0')}`,
      title: `Volume ${volume}`,
      volumeTitle: null,
      authors: [],
      publisher: 'Hachette',
      language: 'fre',
      format: null,
      cover: null,
      work: { id: `wd:Q${volume}`, title: `Volume ${volume}` },
      series: { id: asterix.id, title: 'Astérix', sameAs: [] },
      volumes: [volume],
      volume,
      sources: ['BnF'],
      fetchedAt: '2026-11-01T00:00:00.000Z',
    });
    const line = [1, 2, 3].map(inLine);
    const library: Library = {
      copies: [line[0], line[2]].map((each, i) => ({ rkey: `c${i}`, value: { isbn: each.isbn, works: [each.work.id], createdAt: '2026-11-01T00:00:00.000Z' } })),
      readingStatuses: [],
      follows: [{ rkey: follow, value: { series: follow, anchorIsbn: anchor, status: 'following', updatedAt: '2026-11-01T00:00:00.000Z' } }],
      loans: [],
      toBuy: [],
    };
    const lineOf = vi.fn<Sources['line']>(() => Promise.resolve(line));
    screenWith({ find: () => Promise.resolve({ found: { works: [], authors: [], series: [row] } }), line: lineOf }, { marks: { library, toBuy: new Set() } });

    searchFor('Astérix');

    expect(await screen.findByText(/^You have 2 of 3/)).toBeTruthy();
    expect(lineOf).toHaveBeenCalledWith(anchor);
  });
});

// An answer the test gives when it wants: the request runs until then.
function later<T>() {
  let give!: (value: T) => void;
  const promise = new Promise<T>((resolve) => (give = resolve));
  return { promise, give };
}

describe('Search mode: one request at a time, Back and history (CORE-192)', () => {
  const other: WorkResult = { ...work, id: 'wd:Q1', title: 'Le Crime de l’Orient-Express', year: 1934 };
  const twoWorks = () => Promise.resolve({ found: { works: [work, other], authors: [], series: [] } });

  test('while a request runs, a tap on another row and a new search do nothing; only the first answer shows', async () => {
    const answer = later<{ found: EditionsFound }>();
    const editions = vi.fn<Sources['editions']>(() => answer.promise);
    const find = vi.fn<Sources['find']>(twoWorks);
    screenWith({ find, editions });

    searchFor('Agatha');
    const first = await screen.findByRole('button', { name: /^Dix Petits Nègres/ });
    fireEvent.click(first);
    fireEvent.click(screen.getByRole('button', { name: /^Le Crime/ }));
    searchFor('Poirot');
    fireEvent.submit(screen.getByRole('search'));

    expect(editions).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledTimes(1);
    // The words stay in the field.
    expect(box().value).toBe('Poirot');
    answer.give({ found });
    expect(await screen.findByRole('heading', { name: 'Dix Petits Nègres' })).toBeTruthy();
  });

  test('the current step stays on screen until the next one is ready; the tapped row shows that it loads', async () => {
    const answer = later<{ found: EditionsFound }>();
    screenWith({ find: twoWorks, editions: () => answer.promise });

    searchFor('Agatha');
    const tapped = await screen.findByRole('button', { name: /^Dix Petits Nègres/ });
    fireEvent.click(tapped);

    expect(tapped.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('button', { name: /^Le Crime/ }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('heading', { name: 'Dix Petits Nègres' })).toBeNull();
    answer.give({ found });
    expect(await screen.findByRole('list', { name: 'Français' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Le Crime/ })).toBeNull();
  });

  test('the browser Back goes up one step: the Author’s Works, then the results, with the words in the field', async () => {
    screenWith({
      find: () => Promise.resolve({ found: { works: [], authors: [agatha], series: [] } }),
      authorWorks: (_, page) => Promise.resolve({ found: worksPage(page) }),
    });

    searchFor('Agatha Christie');
    fireEvent.click(await screen.findByRole('button', { name: 'Agatha Christie · 45 Works' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Show more' }));
    await vi.waitFor(() => expect(within(screen.getByRole('list', { name: 'Works' })).getAllByRole('listitem')).toHaveLength(40));
    fireEvent.click(screen.getByRole('button', { name: /^Work 1(?!\d)/ }));
    await screen.findByRole('list', { name: 'Français' });

    history.back();
    // The Author's Works come back as they were: both pages.
    await vi.waitFor(() => expect(within(screen.getByRole('list', { name: 'Works' })).getAllByRole('listitem')).toHaveLength(40));
    history.back();
    expect(await screen.findByRole('button', { name: 'Agatha Christie · 45 Works' })).toBeTruthy();
    expect(box().value).toBe('Agatha Christie');
  });

  test('the Back button goes back in the browser history too, so the browser Back then leaves the Search steps', async () => {
    screenWith();
    const start = history.length;

    await openWork();
    await screen.findByRole('list', { name: 'Français' });
    expect(history.length).toBe(start + 1);
    fireEvent.click(screen.getByRole('button', { name: 'All results' }));

    await vi.waitFor(() => expect((history.state as { searchStep?: number } | null)?.searchStep).toBe(0));
    expect(await screen.findByRole('button', { name: /^Dix Petits Nègres/ })).toBeTruthy();
  });

  test('a deeper step comes in by a view transition of the step; with reduced motion, none', async () => {
    const types: string[][] = [];
    const startViewTransition = vi.fn((options: StartViewTransitionOptions) => {
      types.push([...(options.types ?? [])]);
      void options.update?.();
    });
    Object.assign(document, { startViewTransition });
    const reduced = (matches: boolean) => vi.stubGlobal('matchMedia', (query: string) => ({ matches: matches && query.includes('reduce'), media: query }));
    try {
      reduced(false);
      screenWith();
      await openWork();
      await screen.findByRole('list', { name: 'Français' });
      expect(types).toEqual([['search-fade'], ['search-forward']]);

      cleanup();
      startViewTransition.mockClear();
      reduced(true);
      screenWith();
      await openWork();
      await screen.findByRole('list', { name: 'Français' });
      expect(startViewTransition).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(document, 'startViewTransition');
    }
  });

  test('a new search from a deeper step shows its results, and goes back to the first history entry of Search', async () => {
    const find = vi.fn<Sources['find']>((words) =>
      Promise.resolve({ found: { works: [words === 'Poirot' ? other : work], authors: [], series: [] } }),
    );
    screenWith({ find });

    await openWork();
    await screen.findByRole('list', { name: 'Français' });
    searchFor('Poirot');

    expect(await screen.findByRole('button', { name: /^Le Crime/ })).toBeTruthy();
    await vi.waitFor(() => expect((history.state as { searchStep?: number } | null)?.searchStep).toBe(0));
    expect(screen.getByRole('button', { name: /^Le Crime/ })).toBeTruthy();
  });
});

describe('Search mode: a short story printed in a book (CORE-193)', () => {
  const story: WorkResult = { id: 'wd:Q17177225', also: [], title: 'Le Dieu solitaire', authors: ['Agatha Christie'], year: 1999, language: null, shortStory: true };
  const book: WorkResult = { id: 'wd:Q656127', also: [], title: 'Tant que brillera le jour', authors: ['Agatha Christie'], year: 1997, language: null };
  const none: EditionsFound = { editions: [], noIsbn: 0, sections: [{ language: 'fr', matches: false, editions: [] }] };
  const findStory = () => Promise.resolve({ found: { works: [story], authors: [], series: [] } });

  test('no Edition, printed in a book: the book shows; a tap opens its Editions; Back returns to the short story', async () => {
    const editions = vi.fn<Sources['editions']>((work) => Promise.resolve({ found: work.id === story.id ? { ...none, printedIn: [book] } : found }));
    screenWith({ find: findStory, editions });

    searchFor('Le Dieu solitaire');
    const row = await screen.findByRole('button', { name: /^Le Dieu solitaire/ });
    expect(row.textContent).toContain('Short story');
    fireEvent.click(row);

    const printedIn = await screen.findByRole('list', { name: 'Printed in' });
    expect(screen.queryByText('The book sources list no Edition with an ISBN for this Work.')).toBeNull();
    fireEvent.click(within(printedIn).getByRole('button', { name: /^Tant que brillera le jour Agatha Christie · 1997/ }));

    expect(await screen.findByRole('heading', { name: 'Tant que brillera le jour' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Français' })).toBeTruthy();
    expect(editions.mock.calls.map(([work]) => work.id)).toEqual([story.id, book.id]);
    fireEvent.click(screen.getByRole('button', { name: 'Le Dieu solitaire' }));
    expect(await screen.findByRole('list', { name: 'Printed in' })).toBeTruthy();
  });

  test('no Edition and no book: the message, Back, and Scan the barcode', async () => {
    const calls = screenWith({ find: findStory, editions: () => Promise.resolve({ found: none }) });

    searchFor('Le Dieu solitaire');
    fireEvent.click(await screen.findByRole('button', { name: /^Le Dieu solitaire/ }));

    expect(await screen.findByText('The book sources list no Edition with an ISBN for this Work.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All results' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Scan the barcode' }));
    expect(calls.scans).toBe(1);
  });
});
