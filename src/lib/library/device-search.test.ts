import { describe, expect, test } from 'vitest';
import type { Edition } from '../catalog/catalog';
import type { DeviceCatalog } from '../catalog/device';
import { compareText } from '../i18n/i18n';
import type { Copy } from './copy';
import { deviceBooks, matchOnDevice } from './device-search';
import type { Library } from './model';
import type { Saved } from './records';

const createdAt = '2026-11-01T00:00:00.000Z';
const blacksad = { id: 'wd:Q1000001', title: 'Blacksad', sameAs: [] };

const edition = (isbn: string, change: Partial<Edition> = {}): Edition => ({
  isbn,
  title: 'Blacksad',
  volumeTitle: null,
  authors: ['Juan Díaz Canales'],
  publisher: 'Dargaud',
  language: 'fre',
  format: null,
  cover: null,
  work: { id: `wd:Q${isbn}`, title: 'Blacksad' },
  series: null,
  volumes: [],
  volume: null,
  sources: ['BnF'],
  fetchedAt: createdAt,
  ...change,
});
const volume = (n: number) => edition(`97910999990${n}0`, { series: blacksad, volumes: [n], volume: n, work: { id: `wd:Q20${n}`, title: `Blacksad ${n}` } });

const asterix = edition('9782012101333', { title: 'Astérix le Gaulois', authors: ['René Goscinny', 'Albert Uderzo'], publisher: 'Hachette' });
const coeur = edition('9782070360024', { title: 'Le Cœur cousu', authors: ['Carole Martinez'], publisher: 'Gallimard' });
const dix = edition('9782253241782', { title: 'Dix petits nègres', authors: ['Agatha Christie'] });

const copy = (isbn: string, details?: Copy['details']): Saved<Copy> => ({ rkey: isbn, value: { isbn, works: [`wd:Q${isbn}`], createdAt, ...(details && { details }) } });
const library = (change: Partial<Library>): Library => ({ copies: [], readingStatuses: [], follows: [], loans: [], toBuy: [], ...change });

// A device that keeps `editions` under their ISBN and `lines` under their anchor.
const device = (editions: Edition[], lines: Record<string, Edition[]> = {}): Pick<DeviceCatalog, 'edition' | 'line'> => ({
  edition: (isbn) => Promise.resolve(editions.find((each) => each.isbn === isbn)),
  line: (anchor) => Promise.resolve(lines[anchor]),
});

const titles = (words: string, books: Awaited<ReturnType<typeof deviceBooks>>) => matchOnDevice(words, books, compareText('fr')).map(({ title }) => title);

describe('Search with no network, on the device data', () => {
  test('accents, case and the œ ligature do not count', async () => {
    const books = await deviceBooks(library({ copies: [copy(asterix.isbn), copy(coeur.isbn)] }), device([asterix, coeur]));

    expect(titles('asterix', books)).toEqual(['Astérix le Gaulois']);
    expect(titles('COEUR', books)).toEqual(['Le Cœur cousu']);
  });

  test('every word must be found, in the title or an author', async () => {
    const books = await deviceBooks(library({ copies: [copy(asterix.isbn), copy(dix.isbn)] }), device([asterix, dix]));

    expect(titles('goscinny asterix', books)).toEqual(['Astérix le Gaulois']);
    expect(titles('asterix christie', books)).toEqual([]);
  });

  test('no aliases on the device: "10" does not find "Dix"', async () => {
    const books = await deviceBooks(library({ copies: [copy(dix.isbn)] }), device([dix]));

    expect(titles('10 petits', books)).toEqual([]);
    expect(titles('dix petits', books)).toEqual(['Dix petits nègres']);
  });

  test('the Volumes of a kept Edition Line of a Followed Series, found by the Series title, once each, in order', async () => {
    const line = [1, 2, 3].map(volume);
    const books = await deviceBooks(
      library({
        // Volume 2 is owned too: it shows once.
        copies: [copy(line[1].isbn)],
        follows: [{ rkey: blacksad.id, value: { series: blacksad.id, anchorIsbn: line[0].isbn, status: 'following', updatedAt: createdAt } }],
      }),
      device([line[1]], { [line[0].isbn]: line }),
    );

    const found = matchOnDevice('blacksad', books, compareText('fr'));

    expect(found.map(({ isbn }) => isbn)).toEqual(line.map(({ isbn }) => isbn));
    expect(found[2]).toMatchObject({ volume: 3, publisher: 'Dargaud' });
  });

  test('a Copy the Catalog does not know: its typed title', async () => {
    const books = await deviceBooks(library({ copies: [copy('9791099999993', { title: 'Mon fanzine', authors: ['Moi'] })] }), device([]));

    expect(titles('fanzine', books)).toEqual(['Mon fanzine']);
  });

  test('no word, no match', async () => {
    const books = await deviceBooks(library({ copies: [copy(asterix.isbn)] }), device([asterix]));

    expect(titles('  ', books)).toEqual([]);
  });
});
