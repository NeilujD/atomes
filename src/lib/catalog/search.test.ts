// Search (ADR 0021, CORE-184): find a Work by title words, then its Editions
// from Inventaire and BnF, through the Catalog and its API, on recorded answers.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { answerAuthorWorks, answerEdition, answerFind, answerSeriesVolumes, answerWorkEditions } from './api';
import type { Catalog } from './catalog';
import { createCatalog } from './catalog';
import { recordedFetch } from './recorded.fake';
import type { AuthorResult, AuthorWorks, EditionsFound, Found, VolumeResult, WorkResult } from './search';
import { sourceUrls, type SourceFetch } from './sources';

const christie = 'wd:Q214132'; // "Ils étaient dix", once "Dix petits nègres", "And Then There Were None" in English
// An Inventaire Work of the same novel, by the same Author, whose two Editions have no ISBN.
const christieInventaire = 'inv:9cc51ef9d8cd911a9eac07523f69232f';
const christieInventaireEditions = ['inv:9cc51ef9d8cd911a9eac07523f61c866', 'inv:9cc51ef9d8cd911a9eac07523f692a85'];

const dirs: string[] = [];
const open: Catalog[] = [];

// `now`: the clock of the Catalog, to move past the 24 hours of the cache.
function setup(options: { down?: string[]; fetch?: (recorded: SourceFetch) => SourceFetch; now?: () => Date } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'atomes-search-'));
  dirs.push(dir);
  const sources = recordedFetch(options.down);
  const fetch = options.fetch ? options.fetch(sources.fetch) : sources.fetch;
  const catalog = createCatalog({ file: join(dir, 'catalog.sqlite'), fetch, host: 'catalog.test', accounts: { findDid: () => undefined }, now: options.now });
  open.push(catalog);
  return { catalog, calls: sources.calls };
}

afterEach(() => {
  open.splice(0).forEach((catalog) => catalog.close());
  dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

const reader = { signedIn: true };
const find = (catalog: Catalog, words: string, access = reader) =>
  answerFind(catalog, new URL(`http://atomes.test/api/catalog/find?${new URLSearchParams({ words })}`), { language: 'en', ...access });
// `language`: the Preferred Language; `matched`: the language of the label that matched the words.
const editionsOf = (catalog: Catalog, works: string[], access = reader, { language, matched }: { language?: string; matched?: string } = {}) =>
  answerWorkEditions(
    catalog,
    new URL(
      `http://atomes.test/api/catalog/find/editions?${new URLSearchParams([
        ...works.map((work) => ['work', work]),
        ...(language ? [['language', language]] : []),
        ...(matched ? [['matched', matched]] : []),
      ])}`,
    ),
    access,
  );
const works = async (response: Response) => ((await response.json()) as { works: WorkResult[] }).works;
const authors = async (response: Response) => ((await response.json()) as { authors: AuthorResult[] }).authors;
const worksOf = (catalog: Catalog, author: string, page?: string, access = reader) =>
  answerAuthorWorks(
    catalog,
    new URL(`http://atomes.test/api/catalog/find/author?${new URLSearchParams({ author, ...(page !== undefined && { page }) })}`),
    access,
  );
const editions = async (response: Response) => (await response.json()) as EditionsFound;

describe('Search: find a Work by title words (GET /api/catalog/find)', () => {
  test.each([
    ['Dix petits nègres', 'Dix Petits Nègres', 'fr'],
    ['Ils étaient dix', 'Ils étaient dix', 'fr'],
    ['And Then There Were None', 'And Then There Were None', 'en'],
  ])('"%s", an old, the new or the English title, gives the same Work first, under the title typed and its language', async (words, title, language) => {
    const { catalog } = setup();

    const response = await find(catalog, words);

    expect(response.status).toBe(200);
    expect((await works(response))[0]).toEqual({ id: christie, also: [], title, authors: ['Agatha Christie'], year: 1939, language });
  });

  test('only the typed words leave the server, to Inventaire', async () => {
    const { catalog, calls } = setup();

    await find(catalog, 'Ils étaient dix');

    expect(calls[0]).toBe(sourceUrls.inventaireSearch('Ils étaient dix'));
    // Then the Works and Authors Inventaire gave back, by their identifiers, and its Series search.
    expect(
      calls.slice(1).every((url) => new URL(url).searchParams.get('action') === 'by-uris' || url === sourceUrls.inventaireSeriesSearch('Ils étaient dix')),
    ).toBe(true);
  });

  test('two Works that share an Edition ISBN are one row, with the Wikidata identifier', async () => {
    // The Inventaire Work's first Edition gets the ISBN of the 2020 Livre de poche.
    const shared = sourceUrls.inventaire(christieInventaireEditions.join('|'));
    const { catalog } = setup({
      fetch: (recorded) => async (url) => {
        if (url !== shared) return recorded(url);
        const body = (await (await recorded(url)).json()) as { entities: Record<string, { claims: Record<string, string[]> }> };
        body.entities[christieInventaireEditions[0]].claims['wdt:P212'] = ['978-2-253-24178-2'];
        return Response.json(body);
      },
    });

    const rows = await works(await find(catalog, 'And Then There Were None'));

    expect(rows.find(({ id }) => id === christie)?.also).toEqual([christieInventaire]);
    expect(rows.some(({ id }) => id === christieInventaire)).toBe(false);
  });

  test('two Works with no shared ISBN stay two rows', async () => {
    const { catalog } = setup();

    const rows = await works(await find(catalog, 'And Then There Were None'));

    expect(rows.filter(({ id }) => id === christie || id === christieInventaire).map(({ id, also }) => [id, also])).toEqual([
      [christie, []],
      [christieInventaire, []],
    ]);
  });

  test('signed out: 401, and no source is asked', async () => {
    const { catalog, calls } = setup();

    expect((await find(catalog, 'Ils étaient dix', { signedIn: false })).status).toBe(401);
    expect((await editionsOf(catalog, [christie], { signedIn: false })).status).toBe(401);
    expect(calls).toEqual([]);
  });

  test.each([[''], ['   '], ['x'.repeat(301)]])('bad words (%j) give 400', async (words) => {
    const { catalog } = setup();
    expect((await find(catalog, words)).status).toBe(400);
  });

  test.each([[[]], [['isbn:9782253241782']], [['wd:Q1', 'wd:Q2', 'wd:Q3', 'wd:Q4', 'wd:Q5', 'wd:Q6']]])('bad Works (%j) give 400', async (work) => {
    const { catalog } = setup();
    expect((await editionsOf(catalog, work)).status).toBe(400);
  });
});

describe('Search: the Editions of a Work (GET /api/catalog/find/editions)', () => {
  test('merges BnF and Inventaire by ISBN-13, newest first, and counts the Editions with no ISBN', async () => {
    const { catalog } = setup();

    const response = await editionsOf(catalog, [christie]);

    expect(response.status).toBe(200);
    const found = await editions(response);
    // BnF knows 22 ISBNs, Inventaire 32, both 9 (the spike found 35, 32 and 9 with more BnF queries).
    expect(found.editions).toHaveLength(45);
    expect(new Set(found.editions.map(({ isbn }) => isbn)).size).toBe(45);
    // 14 BnF records and 9 Inventaire Editions have no ISBN.
    expect(found.noIsbn).toBe(23);
    const years = found.editions.map(({ year }) => year ?? 0);
    expect(years).toEqual([...years].sort((a, b) => b - a));
    expect(years[0]).toBe(2025);
    // In both sources: shown once, as printed in 2020.
    expect(found.editions.find(({ isbn }) => isbn === '9782253241782')).toEqual({
      isbn: '9782253241782',
      title: 'Ils étaient dix',
      year: 2020,
      publisher: 'le Livre de poche',
      collection: 'Le livre de poche',
      language: 'fre',
    });
    // BnF only, and Inventaire only (an English Edition).
    expect(found.editions.find(({ isbn }) => isbn === '9782017333845')).toMatchObject({ title: 'Ils étaient dix', year: 2025 });
    expect(found.editions.find(({ isbn }) => isbn === '9780062325549')).toMatchObject({ title: 'And Then There Were None', language: 'eng' });
  });

  test('an Edition known by its ISBN-10 only shows as ISBN-13, under the title printed then', async () => {
    const { catalog } = setup();

    const found = await editions(await editionsOf(catalog, [christie]));

    // BnF record 010 $a "2-253-01709-4".
    expect(found.editions.find(({ isbn }) => isbn === '9782253017097')).toMatchObject({ title: 'Dix petits nègres', year: 1977 });
  });

  test('the second call for the same words or Work within 24 hours asks no source; a day later it does', async () => {
    let now = new Date('2026-11-23T10:00:00Z');
    const { catalog, calls } = setup({ now: () => now });
    await find(catalog, 'Ils étaient dix');
    await editionsOf(catalog, [christie]);
    const asked = calls.length;

    now = new Date('2026-11-24T09:59:00Z');
    expect((await works(await find(catalog, 'Ils étaient dix')))[0].id).toBe(christie);
    expect((await editions(await editionsOf(catalog, [christie]))).editions).toHaveLength(45);
    expect(calls).toHaveLength(asked);

    now = new Date('2026-11-24T10:01:00Z');
    await find(catalog, 'Ils étaient dix');
    expect(calls.length).toBeGreaterThan(asked);
  });

  test('a source down gives 503 and keeps nothing of the call', async () => {
    const { catalog, calls } = setup({ down: ['catalogue.bnf.fr'] });

    expect((await editionsOf(catalog, [christie])).status).toBe(503);
    const asked = calls.length;
    expect(calls.some((url) => url.startsWith('https://inventaire.io/'))).toBe(true);

    // The Inventaire answers of the failed call were not kept: it asks them again.
    await editionsOf(catalog, [christie]);
    expect(calls.slice(asked).filter((url) => url.startsWith('https://inventaire.io/'))).toEqual(
      calls.slice(0, asked).filter((url) => url.startsWith('https://inventaire.io/')),
    );
  });

  test('Inventaire down: Search gives 503', async () => {
    const { catalog } = setup({ down: ['inventaire.io'] });
    expect((await find(catalog, 'Ils étaient dix')).status).toBe(503);
  });

  test('the pick of an Edition BnF lists only by its ISBN-10 is found by the normal lookup', async () => {
    const { catalog, calls } = setup();

    // The 1977 Edition: BnF 010 $a "2-253-01709-4", unknown to Inventaire.
    const response = await answerEdition(catalog, '9782253017097');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ title: 'Dix petits nègres', publisher: '[Librairie générale française]' });
    // BnF finds no record by the ISBN-13 of an ISBN-10 record: the lookup asks both forms.
    const bnf = calls.find((url) => url.startsWith('https://catalogue.bnf.fr/'));
    expect(new URL(bnf!).searchParams.get('query')).toBe('bib.isbn adj "9782253017097" or bib.isbn adj "2253017094"');
  });
});

describe('Search: the Editions in the Preferred Language, and in the language of the words (CORE-186)', () => {
  const headings = (found: EditionsFound) => found.sections.map(({ language, matches }) => [language, matches]);
  const languagesOf = (section: EditionsFound['sections'][number]) => new Set(section.editions.map(({ language }) => language));

  test('"And Then There Were None" with French preferred: a French section, then an English section', async () => {
    const { catalog } = setup();

    const found = await editions(await editionsOf(catalog, [christie], reader, { language: 'fr', matched: 'en' }));

    expect(headings(found)).toEqual([
      ['fr', false],
      ['en', true],
    ]);
    expect(languagesOf(found.sections[0])).toEqual(new Set(['fre']));
    expect(languagesOf(found.sections[1])).toEqual(new Set(['eng']));
    expect(found.sections[0].editions.find(({ isbn }) => isbn === '9782253241782')).toMatchObject({ title: 'Ils étaient dix' });
    expect(found.sections[1].editions.find(({ isbn }) => isbn === '9780062325549')).toBeDefined();
  });

  test('"Ils étaient dix" with French preferred: the French section only', async () => {
    const { catalog } = setup();

    const found = await editions(await editionsOf(catalog, [christie], reader, { language: 'fr', matched: 'fr' }));

    expect(headings(found)).toEqual([['fr', false]]);
  });

  test('a title that is the same in both languages ("Dune"): the Preferred Language only', async () => {
    // The Work gets its English label in French too.
    const work = sourceUrls.inventaire(christie);
    const { catalog } = setup({
      fetch: (recorded) => async (url) => {
        if (url !== work) return recorded(url);
        const body = (await (await recorded(url)).json()) as { entities: Record<string, { labels: Record<string, string> }> };
        body.entities[christie].labels.fr = 'And Then There Were None';
        return Response.json(body);
      },
    });

    const found = await editions(await editionsOf(catalog, [christie], reader, { language: 'fr', matched: 'en' }));

    expect(headings(found)).toEqual([['fr', false]]);
  });

  test('"All languages": one list, newest first, every row with its language', async () => {
    const { catalog } = setup();

    const found = await editions(await editionsOf(catalog, [christie], reader, { language: 'all', matched: 'en' }));

    expect(headings(found)).toEqual([[null, false]]);
    const [all] = found.sections;
    expect(all.editions).toEqual(found.editions);
    const years = all.editions.map(({ year }) => year ?? 0);
    expect(years).toEqual([...years].sort((a, b) => b - a));
    expect(all.editions.every(({ language }) => language)).toBe(true);
  });

  test.each([['xx-yy'], ['<b>']])('a bad language (%j) gives 400', async (language) => {
    const { catalog } = setup();
    expect((await editionsOf(catalog, [christie], reader, { language })).status).toBe(400);
  });
});

const agatha = 'wd:Q35064';

describe('Search: Authors (CORE-188)', () => {
  test('"Agatha Christie" gives her Author row, with her number of Works', async () => {
    const { catalog } = setup();

    const rows = await authors(await find(catalog, 'Agatha Christie'));

    expect(rows[0]).toEqual({ id: agatha, name: 'Agatha Christie', birthYear: 1890, works: 385 });
  });

  test('the Works of an Author: 20 per page, newest first; page 2 goes on with no repeat', async () => {
    const { catalog } = setup();

    const first = (await (await worksOf(catalog, agatha)).json()) as AuthorWorks;
    const second = (await (await worksOf(catalog, agatha, '2')).json()) as AuthorWorks;

    expect(first.total).toBe(385);
    expect(first.works).toHaveLength(20);
    expect(second.works).toHaveLength(20);
    const years = [...first.works, ...second.works].map(({ year }) => year ?? 0);
    expect(years).toEqual([...years].sort((a, b) => b - a));
    const ids = [...first.works, ...second.works].map(({ id }) => id);
    expect(new Set(ids).size).toBe(40);
    expect(first.works.every(({ authors }) => authors.includes('Agatha Christie'))).toBe(true);
  });

  test('two Authors with the same name both show, with their birth years', async () => {
    const { catalog } = setup();

    const rows = await authors(await find(catalog, 'Alexandre Dumas'));

    expect(rows.filter(({ name }) => name === 'Alexandre Dumas').map(({ id, birthYear }) => [id, birthYear])).toEqual(
      expect.arrayContaining([
        ['wd:Q38337', 1802],
        ['wd:Q169150', 1824],
      ]),
    );
  });

  test('an Author row needs every typed word in the name', async () => {
    const { catalog } = setup();

    expect(await authors(await find(catalog, 'christie dix'))).toEqual([]);
  });

  test('signed out: 401, and no source is asked', async () => {
    const { catalog, calls } = setup();

    expect((await worksOf(catalog, agatha, '1', { signedIn: false })).status).toBe(401);
    expect(calls).toEqual([]);
  });

  test.each([
    ['isbn:9782253241782', '1'],
    ['wd:Q35064', '0'],
    ['wd:Q35064', '1.5'],
    ['wd:Q35064', '101'],
    ['wd:Q35064', 'x'],
  ])('bad Author or page (%s, %s) gives 400', async (author, page) => {
    const { catalog } = setup();
    expect((await worksOf(catalog, author, page)).status).toBe(400);
  });

  test('Inventaire down: the Works of an Author give 503', async () => {
    const { catalog } = setup({ down: ['inventaire.io'] });
    expect((await worksOf(catalog, agatha)).status).toBe(503);
  });
});

describe('Search: mixed words and the BnF fallback (CORE-188)', () => {
  test('"christie dix", author and title words, finds the Work', async () => {
    const { catalog } = setup();

    const rows = await works(await find(catalog, 'christie dix'));

    expect(rows.map(({ id }) => id)).toContain(christie);
  });

  test('a word Inventaire does not know goes to BnF, printed text only, as Work rows grouped by Work authority', async () => {
    const { catalog, calls } = setup();

    const rows = await works(await find(catalog, 'Plouguerneau'));

    const bnf = calls.find((url) => url.startsWith('https://catalogue.bnf.fr/'));
    expect(new URL(bnf!).searchParams.get('query')).toBe(
      '(bib.title all "Plouguerneau" or bib.author all "Plouguerneau") and bib.doctype any "a"',
    );
    expect(rows.find(({ id }) => id === 'bnf:87198521')).toMatchObject({ title: 'Des Lotrian du Léon, de 1600 à 1994', words: 'Plouguerneau' });
    expect(rows.find(({ id }) => id === 'bnf:87198539')).toBeDefined();
    expect(new Set(rows.map(({ id }) => id)).size).toBe(rows.length);
    expect(rows.every(({ id }) => /^bnf:/.test(id))).toBe(true);
  });

  test('a BnF Work row opens on its Editions', async () => {
    const { catalog } = setup();
    const rows = await works(await find(catalog, 'Plouguerneau'));
    const row = rows.find(({ id }) => id === 'bnf:87198521')!;

    const response = await answerWorkEditions(
      catalog,
      new URL(`http://atomes.test/api/catalog/find/editions?${new URLSearchParams({ work: row.id, words: row.words! })}`),
      reader,
    );

    expect(response.status).toBe(200);
    expect((await editions(response)).editions.length).toBeGreaterThan(0);
  });

  test('a BnF Work row with no words gives 400', async () => {
    const { catalog } = setup();
    expect((await editionsOf(catalog, ['bnf:87198521'])).status).toBe(400);
  });
});

describe('Search: Series and Volumes (CORE-187)', () => {
  const asterix = 'wd:Q42490';
  const combatDesChefs = 'wd:Q1194700'; // Astérix 7
  const series = async (response: Response) => ((await response.json()) as Found).series;
  const volumesOf = (catalog: Catalog, id: string, access = reader) =>
    answerSeriesVolumes(catalog, new URL(`http://atomes.test/api/catalog/find/series?${new URLSearchParams({ series: id })}`), { language: 'en', ...access });
  const volumes = async (response: Response) => ((await response.json()) as { volumes: VolumeResult[] }).volumes;

  test('"Astérix" gives a Series row with its Edition Lines, each named by its publisher and years', async () => {
    const { catalog } = setup();

    const rows = await series(await find(catalog, 'Astérix'));

    // Inventaire also finds "Asterix Omnibus" and a German Series, which BnF lists no Edition Line of.
    expect(rows.map(({ id, title }) => ({ id, title }))).toEqual([{ id: asterix, title: 'Astérix' }]);
    expect(rows[0].lines).toEqual([
      { publisher: 'Éditions Albert René', first: 1981, last: 1983, language: 'dut' },
      { publisher: 'Dargaud', first: 1982, last: 1984, language: 'fre' },
      { publisher: 'Éditions G.P.', first: 1983, last: 1984, language: 'fre' },
      { publisher: 'Hachette', first: 2001, last: 2004, language: 'fre' },
      { publisher: 'Éditions France loisirs', first: 2015, last: 2017, language: 'fre' },
      { publisher: 'les Éditions Albert René', first: 2018, last: 2018, language: 'fre' },
    ]);
  });

  test('the Volumes of a Series by number: "7 · Le Combat des chefs"; a Volume with no number has its title only, last', async () => {
    const { catalog } = setup();

    const response = await volumesOf(catalog, asterix);

    expect(response.status).toBe(200);
    const all = await volumes(response);
    expect(all[6]).toEqual({ id: combatDesChefs, number: 7, title: 'Le Combat des chefs' });
    expect(all.slice(0, 41).map(({ number }) => number)).toEqual(Array.from({ length: 41 }, (_, i) => i + 1));
    expect(all.slice(41).every(({ number }) => number === null)).toBe(true);
    expect(all).toContainEqual({ id: 'wd:Q97188282', number: null, title: "Le Menhir d'or" });
  });

  test('"Le Combat des chefs" gives the Volume 7 Work; its Editions carry the Volume number and title and their Edition Line name', async () => {
    const { catalog } = setup();

    expect((await works(await find(catalog, 'Le Combat des chefs')))[0].id).toBe(combatDesChefs);
    const found = await editions(await editionsOf(catalog, [combatDesChefs]));

    expect(found.editions.find(({ isbn }) => isbn === '9782012101395')).toMatchObject({
      volume: 7,
      volumeTitle: 'Le combat des chefs',
      line: { publisher: 'Hachette', first: 2001, last: 2004, language: 'fre' },
    });
    // Every Edition Line: the Dargaud Edition of 1984 too.
    expect(found.editions.find(({ isbn }) => isbn === '9782205001709')?.line).toEqual({ publisher: 'Dargaud', first: 1982, last: 1984, language: 'fre' });
  });

  test('a Volume BnF gives with a number only (One Piece 56) has no Volume title', async () => {
    const { catalog } = setup();

    const volume56 = (await volumes(await volumesOf(catalog, 'wd:Q28667972'))).find(({ number }) => number === 56)!;
    const found = await editions(await editionsOf(catalog, [volume56.id]));

    expect(found.editions.find(({ isbn }) => isbn === '9782723478991')).toMatchObject({ volume: 56, volumeTitle: null });
  });

  test('the Editions of a Work that is no Volume carry no Volume', async () => {
    const { catalog } = setup();

    const found = await editions(await editionsOf(catalog, [christie]));

    expect(found.editions.every((each) => !('volume' in each) && !('line' in each))).toBe(true);
  });

  test('the Volumes of a Series: signed out 401, a bad identifier 400, Inventaire down 503', async () => {
    expect((await volumesOf(setup().catalog, asterix, { signedIn: false })).status).toBe(401);
    expect((await volumesOf(setup().catalog, 'Q42490')).status).toBe(400);
    expect((await volumesOf(setup({ down: ['inventaire.io'] }).catalog, asterix)).status).toBe(503);
  });
});
