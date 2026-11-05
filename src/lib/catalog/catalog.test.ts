import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { isSeriesId } from '../library/ids';
import { answerEdition, answerVolumes } from './api';
import type { Catalog, Edition } from './catalog';
import { createCatalog } from './catalog';
import { recordedFetch } from './recorded.fake';

const onePiece56 = '9782723478991';
const onePiece112 = '9782344068922'; // 2026: no 461 in any source, 19 cm (56 is 18 x 12 cm)
const spyFamily16 = '9791042021030'; // 2026: BnF has no Series link yet, SUDOC has
const horde = '9782072927515'; // La Horde du Contrevent, Folio SF (owner's shelf)
const unknown = '9791099999993'; // valid check digit, no source knows it

const dirs: string[] = [];
const open: Catalog[] = [];

function setup(down: string[] = []) {
  const dir = mkdtempSync(join(tmpdir(), 'atomes-catalog-'));
  dirs.push(dir);
  const file = join(dir, 'catalog.sqlite');
  const sources = recordedFetch(down);
  const catalog = createCatalog({ file, fetch: sources.fetch, host: 'catalog.test' });
  open.push(catalog);
  // A second Catalog on the same file, as after a server restart.
  const reopen = (fetch = recordedFetch().fetch) => {
    const again = createCatalog({ file, fetch, host: 'catalog.test' });
    open.push(again);
    return again;
  };
  return { catalog, calls: sources.calls, reopen };
}

afterEach(() => {
  open.splice(0).forEach((catalog) => catalog.close());
  dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

const edition = async (response: Response) => (await response.json()) as Edition;

describe('GET /api/catalog/editions/{isbn}', () => {
  test('a miss is fetched from the sources: Edition, Work, Series and Volume', async () => {
    const { catalog } = setup();

    const response = await answerEdition(catalog, '978-2-7234-7899-1');

    expect(response.status).toBe(200);
    expect(await edition(response)).toMatchObject({
      isbn: onePiece56,
      title: 'One Piece',
      authors: ['Eiichirō Oda'],
      publisher: 'Glénat',
      language: 'fre',
      format: '18 x 12 cm',
      cover: 'https://inventaire.io/img/entities/65883d822ab1b56d8f46aeb26c35d1feb9098a9b',
      work: { id: 'inv:ce9131dff9916ae2e619de81800be29a', title: 'Merci pour tout' },
      series: { id: 'wd:Q673', title: 'One Piece' },
      volume: 56,
      sources: ['BnF', 'Inventaire'],
    });
  });

  test('a second lookup of the same ISBN is served from SQLite, also after a restart', async () => {
    const { catalog, calls, reopen } = setup();
    const first = await edition(await answerEdition(catalog, onePiece56));
    const asked = calls.length;

    const again = await edition(await answerEdition(catalog, onePiece56));
    const offline = recordedFetch(['catalogue.bnf.fr', 'www.sudoc.fr', 'inventaire.io', 'openlibrary.org']);
    const afterRestart = await edition(await answerEdition(reopen(offline.fetch), onePiece56));

    expect(asked).toBeGreaterThan(0);
    expect(calls).toHaveLength(asked);
    expect(offline.calls).toEqual([]);
    expect(again).toEqual(first);
    expect(afterRestart).toEqual(first);
  });

  test('an unknown ISBN gives a clear not-found answer, remembered for a day', async () => {
    const { catalog, calls } = setup();

    const response = await answerEdition(catalog, unknown);
    const asked = calls.length;
    const again = await answerEdition(catalog, unknown);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'NotFound', isbn: unknown, message: 'No open source knows this ISBN.' });
    expect(again.status).toBe(404);
    expect(calls).toHaveLength(asked);
  });

  test.each(['', '12345', '9782723478992', '9790230000000'])('%s is not an ISBN-13 and no source is asked', async (isbn) => {
    const { catalog, calls } = setup();

    const response = await answerEdition(catalog, isbn);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'InvalidIsbn' });
    expect(calls).toEqual([]);
  });

  test('a recent Volume with no Series link gets its Series from its title; the Catalog mints its identifier', async () => {
    const { catalog } = setup();

    const found = await edition(await answerEdition(catalog, spyFamily16));

    expect(found).toMatchObject({ title: 'Spy x family', publisher: 'Kurokawa', volume: 16, sources: ['BnF', 'SUDOC'] });
    expect(found.authors[0]).toBe('Tatsuya Endō');
    expect(found.series?.title).toBe('Spy x family'); // BnF first; SUDOC's 461 says 'Spy x Family'
    expect(found.series?.id).toMatch(/^atomes:catalog\.test:/);
    expect(isSeriesId(found.series?.id ?? '')).toBe(true);
    expect(found.work).toEqual({ id: `isbn:${spyFamily16}`, title: 'Spy x family' });
  });

  test('sources that name another book for the same ISBN are not merged', async () => {
    const { catalog } = setup();

    // Recorded: SUDOC, Inventaire and Open Library give three different books.
    const found = await edition(await answerEdition(catalog, '9780000000002'));

    expect(found).toMatchObject({ title: 'Granites and basalts', sources: ['SUDOC'], cover: null });
    expect(found.work).toEqual({ id: 'isbn:9780000000002', title: 'Granites and basalts' });
  });

  test('a novel in a publisher collection has no Series; sources merge across case and accents', async () => {
    const { catalog } = setup();

    // BnF 225: Folio Science-fiction n° 271 is a publisher collection, not a Series.
    const found = await edition(await answerEdition(catalog, horde));

    expect(found).toMatchObject({
      title: 'La horde du Contrevent',
      authors: ['Alain Damasio'],
      publisher: 'Gallimard',
      series: null,
      volume: null,
      work: { id: 'wd:Q3209796', title: 'La Horde du Contrevent' },
      sources: ['BnF', 'SUDOC', 'Inventaire', 'Open Library'],
    });
  });

  test('when a source is down, the answer is given but not stored', async () => {
    const { catalog, reopen } = setup(['catalogue.bnf.fr']);

    const response = await answerEdition(catalog, onePiece56);
    const later = recordedFetch();
    const again = await edition(await answerEdition(reopen(later.fetch), onePiece56));

    expect(response.status).toBe(200);
    expect(await edition(response)).toMatchObject({ title: 'One Piece 56', sources: ['Inventaire'] });
    expect(later.calls.length).toBeGreaterThan(0);
    expect(again.sources).toEqual(['BnF', 'Inventaire']);
  });

  test('when every source is down, the answer says so and nothing is remembered', async () => {
    const { catalog, reopen } = setup(['catalogue.bnf.fr', 'www.sudoc.fr', 'inventaire.io', 'openlibrary.org']);

    const response = await answerEdition(catalog, unknown);
    const later = await answerEdition(reopen(), unknown);

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'SourcesUnavailable' });
    expect(later.status).toBe(404);
  });
});

describe('GET /api/catalog/editions/{isbn}/volumes', () => {
  test('lists the known Volumes of the Edition Line of the anchor ISBN', async () => {
    const { catalog } = setup();

    const response = await answerVolumes(catalog, onePiece56);
    const body = (await response.json()) as { series: Edition['series']; volumes: Edition[] };

    expect(response.status).toBe(200);
    expect(body.series).toEqual({ id: 'wd:Q673', title: 'One Piece' });
    expect(body.volumes.map((v) => [v.isbn, v.volume])).toEqual([[onePiece56, 56]]);
  });

  test('an Edition with no Series is its own only Volume', async () => {
    const { catalog } = setup();

    const body = (await (await answerVolumes(catalog, horde)).json()) as { series: Edition['series']; volumes: Edition[] };

    expect(body.series).toBeNull();
    expect(body.volumes.map((v) => v.isbn)).toEqual([horde]);
  });

  test('orders the Volumes of one Edition Line by Volume number, whatever the lookup order', async () => {
    const { catalog } = setup();
    await answerEdition(catalog, onePiece56);

    const body = (await (await answerVolumes(catalog, onePiece112)).json()) as { series: Edition['series']; volumes: Edition[] };

    // 112 has no Series link in any source: its title finds the Series that 56 brought.
    expect(body.series).toEqual({ id: 'wd:Q673', title: 'One Piece' });
    expect(body.volumes.map((v) => [v.isbn, v.volume])).toEqual([
      [onePiece56, 56],
      [onePiece112, 112],
    ]);
  });

  test('an unknown ISBN gives a not-found answer', async () => {
    const { catalog } = setup();

    expect((await answerVolumes(catalog, unknown)).status).toBe(404);
  });
});
