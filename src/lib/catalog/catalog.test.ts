import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { isSeriesId } from '../library/ids';
import { answerChoose, answerCover, answerEdition, answerSearch, answerVolumes } from './api';
import type { Catalog, Edition, SearchFound } from './catalog';
import { createCatalog } from './catalog';
import { recordedFetch } from './recorded.fake';
import { isCoverUrl, type SourceFetch } from './sources';

const onePiece56 = '9782723478991';
const onePiece112 = '9782344068922'; // 2026: no 461 in any source, 19 cm (56 is 18 x 12 cm)
const spyFamily16 = '9791042021030'; // 2026: BnF has no Series link yet, SUDOC has
const horde = '9782072927515'; // La Horde du Contrevent, Folio SF (owner's shelf)
const unknown = '9791099999993'; // valid check digit, no source knows it
// Owner's shelf (CORE-40): Kaamelott 10, Casterman. No source knows its ISBN; BnF has 1 to 9.
const kaamelott10 = '9782203255647';
const kaamelott9 = '9782203085053';

const dirs: string[] = [];
const open: Catalog[] = [];

// `covers`: what the cover hosts answer; the recorded sources answer the rest.
function setup(down: string[] = [], covers?: (url: string) => Response) {
  const dir = mkdtempSync(join(tmpdir(), 'atomes-catalog-'));
  dirs.push(dir);
  const file = join(dir, 'catalog.sqlite');
  const sources = recordedFetch(down);
  const fetch: SourceFetch = (url) => (covers && isCoverUrl(url) ? Promise.resolve(covers(url)) : sources.fetch(url));
  const catalog = createCatalog({ file, fetch, host: 'catalog.test' });
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

// An Edition Line fill starts only for a signed-in reader (ADR 0010, Catalog access).
const signedIn = { fill: true };
const signedOut = { fill: false };

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

    const response = await answerVolumes(catalog, onePiece56, signedIn);
    const body = (await response.json()) as { series: Edition['series']; volumes: Edition[] };

    expect(response.status).toBe(200);
    expect(body.series).toEqual({ id: 'wd:Q673', title: 'One Piece' });
    expect(body.volumes.map((v) => [v.isbn, v.volume])).toEqual([[onePiece56, 56]]);
  });

  test('an Edition with no Series is its own only Volume', async () => {
    const { catalog } = setup();

    const body = (await (await answerVolumes(catalog, horde, signedIn)).json()) as { series: Edition['series']; volumes: Edition[] };

    expect(body.series).toBeNull();
    expect(body.volumes.map((v) => v.isbn)).toEqual([horde]);
  });

  test('orders the Volumes of one Edition Line by Volume number, whatever the lookup order', async () => {
    const { catalog } = setup();
    await answerEdition(catalog, onePiece56);

    const body = (await (await answerVolumes(catalog, onePiece112, signedIn)).json()) as { series: Edition['series']; volumes: Edition[] };

    // 112 has no Series link in any source: its title finds the Series that 56 brought.
    expect(body.series).toEqual({ id: 'wd:Q673', title: 'One Piece' });
    expect(body.volumes.map((v) => [v.isbn, v.volume])).toEqual([
      [onePiece56, 56],
      [onePiece112, 112],
    ]);
  });

  test('an unknown ISBN gives a not-found answer', async () => {
    const { catalog } = setup();

    expect((await answerVolumes(catalog, unknown, signedIn)).status).toBe(404);
  });
});

describe('Volumes of a whole Edition Line, from a BnF search (Series Onboarding)', () => {
  const volumesOf = async (catalog: Catalog, isbn: string, access = signedIn) =>
    ((await (await answerVolumes(catalog, isbn, access)).json()) as { volumes: Edition[] }).volumes;

  test('with no session no fill starts: the answer gives what the Catalog already has', async () => {
    const { catalog, calls } = setup();

    const volumes = await volumesOf(catalog, spyFamily16, signedOut);

    expect(volumes.map((v) => v.isbn)).toEqual([spyFamily16]);
    expect(calls.filter((url) => url.includes('bib.title'))).toEqual([]);
  });

  test('with no session the Volumes a fill brought before are given', async () => {
    const { catalog, calls } = setup();
    await volumesOf(catalog, spyFamily16, signedIn);
    const searches = calls.length;

    expect(await volumesOf(catalog, spyFamily16, signedOut)).toHaveLength(16);
    expect(calls).toHaveLength(searches);
  });

  test('BnF lists the Edition Line: one Edition per Volume, 1 to 16, other books left out', async () => {
    const { catalog } = setup();

    const volumes = await volumesOf(catalog, spyFamily16);

    expect(volumes.map((v) => v.volume)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const isbns = volumes.map((v) => v.isbn);
    // Volume 11 has two printings; the one in the BnF Series record of the line counts.
    expect(isbns).toContain('9782380715378');
    expect(isbns).not.toContain('9782380714340');
    // Another BnF Series with the same title (its own Volume 1) is another book.
    expect(isbns).not.toContain('9782380714487');
    expect(new Set(volumes.map((v) => v.series?.id)).size).toBe(1);
  });

  test('a listed Volume gets the Work a lookup gives it: Inventaire, even when BnF names the Volume itself', async () => {
    const { catalog } = setup();

    const volumes = await volumesOf(catalog, spyFamily16);

    // BnF titles Volume 2 "Mission start"; Inventaire says "Spy × Family, Tome 2".
    expect(volumes.find((v) => v.volume === 2)).toMatchObject({
      isbn: '9782380710250',
      title: 'Mission start',
      work: { id: 'inv:3fdcb00a816ff62049c076960e840d89' },
      sources: ['BnF', 'Inventaire'],
    });
    // Unknown to Inventaire: the one Work of that Edition.
    expect(volumes.find((v) => v.volume === 13)?.work.id).toBe('isbn:9791042014704');
  });

  test('the Edition Line is asked for once, also after a restart; its Volumes are then served from SQLite', async () => {
    const { catalog, reopen } = setup();
    await volumesOf(catalog, spyFamily16);

    const later = recordedFetch();
    const again = reopen(later.fetch);
    expect(await volumesOf(again, spyFamily16)).toHaveLength(16);
    expect((await edition(await answerEdition(again, '9782380710250'))).work.id).toBe('inv:3fdcb00a816ff62049c076960e840d89');
    expect(later.calls).toEqual([]);
  });

  test('calls at the same time share one BnF search', async () => {
    const { catalog, calls } = setup();
    await answerEdition(catalog, spyFamily16);

    await Promise.all([volumesOf(catalog, spyFamily16), volumesOf(catalog, spyFamily16), volumesOf(catalog, spyFamily16)]);

    expect(calls.filter((url) => url.includes('bib.title')).length).toBe(1);
  });

  test('after a failed fill the sources rest for an hour, then are asked again', async () => {
    let clock = new Date('2026-11-06T10:00:00.000Z');
    const sources = recordedFetch();
    let bnfDown = false;
    const fetch: SourceFetch = (url) =>
      bnfDown && url.includes('bib.title') ? Promise.resolve(new Response('down', { status: 503 })) : sources.fetch(url);
    const catalog = createCatalog({ file: ':memory:', fetch, host: 'catalog.test', now: () => clock });
    open.push(catalog);
    await answerEdition(catalog, spyFamily16);
    const searches = () => sources.calls.filter((url) => url.includes('bib.title')).length;

    bnfDown = true;
    expect(await volumesOf(catalog, spyFamily16)).toHaveLength(1);
    bnfDown = false;
    expect(await volumesOf(catalog, spyFamily16)).toHaveLength(1);
    expect(searches()).toBe(0);

    clock = new Date('2026-11-06T11:00:01.000Z');
    expect(await volumesOf(catalog, spyFamily16)).toHaveLength(16);
  });

  test('when a source is down nothing is added, and the next call asks again', async () => {
    const { catalog, reopen } = setup();
    await answerEdition(catalog, spyFamily16);

    expect(await volumesOf(reopen(recordedFetch(['inventaire.io']).fetch), spyFamily16)).toHaveLength(1);
    expect(await volumesOf(reopen(recordedFetch(['catalogue.bnf.fr']).fetch), spyFamily16)).toHaveLength(1);
    expect(await volumesOf(reopen(), spyFamily16)).toHaveLength(16);
  });
});

describe('An ISBN no source knows: find the Series or Work by title (CORE-40)', () => {
  const reader = { signedIn: true };
  const search = (catalog: Catalog, query: string, access = reader) =>
    answerSearch(catalog, new URL(`http://atomes.test/api/catalog/search?${query}`), access);
  const found = async (response: Response) => (await response.json()) as SearchFound;

  test('a typed title and publisher give the Edition Line BnF knows, with its Volumes', async () => {
    const { catalog, calls } = setup();

    const response = await search(catalog, 'title=Kaamelott&publisher=Casterman');

    expect(response.status).toBe(200);
    const { lines } = await found(response);
    expect(lines).toEqual([
      { anchor: kaamelott9, series: 'Kaamelott', publisher: 'Casterman', language: 'fre', volumes: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    ]);
    // One BnF page; the ISBN the reader scanned never leaves the server.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('bib.title');
  });

  test('books with no Volume come as Works: other Editions of the same book', async () => {
    const { catalog } = setup();

    const { lines, works } = await found(await search(catalog, 'title=R%C3%A9glez-lui%20son%20compte&publisher=Fleuve'));

    expect(lines).toEqual([]);
    expect(works).toEqual([
      { anchor: '9782265017412', title: 'Réglez-lui son compte !', authors: ['San-Antonio'], publisher: 'Éditions Fleuve noir', year: 1981 },
      { anchor: '9782265144026', title: 'Réglez-lui son compte !', authors: ['San-Antonio'], publisher: 'Fleuve noir', year: 2019 },
    ]);
  });

  test('signed out, or with no title, nothing is asked', async () => {
    const { catalog, calls } = setup();

    expect((await search(catalog, 'title=Kaamelott', { signedIn: false })).status).toBe(401);
    expect((await search(catalog, 'title=%20&publisher=Casterman')).status).toBe(400);
    expect((await search(catalog, `title=${'a'.repeat(301)}`)).status).toBe(400);
    expect(calls).toEqual([]);
  });

  const choose = (catalog: Catalog, isbn: string, body: unknown, access = reader) => answerChoose(catalog, isbn, body, access);
  const kaamelott10Choice = { anchor: kaamelott9, volume: 10, title: 'Kaamelott 10', authors: [] };

  test('the reader picks the Series Kaamelott (Casterman) and Volume 10: the Catalog keeps it as the reader gave it', async () => {
    const { catalog, reopen } = setup();
    expect((await answerEdition(catalog, kaamelott10)).status).toBe(404);

    const response = await choose(catalog, kaamelott10, kaamelott10Choice);

    expect(response.status).toBe(200);
    const anchor = await edition(await answerEdition(catalog, kaamelott9));
    const chosen = {
      isbn: kaamelott10,
      title: 'Kaamelott 10',
      volumeTitle: null,
      authors: anchor.authors,
      publisher: 'Casterman',
      language: 'fre',
      format: null,
      cover: null,
      work: { id: `isbn:${kaamelott10}`, title: 'Kaamelott 10' },
      series: anchor.series,
      volume: 10,
      sources: ['reader'],
    };
    expect(await edition(response)).toMatchObject(chosen);
    // Kept, also after a restart, with no source call.
    const offline = recordedFetch(['catalogue.bnf.fr', 'www.sudoc.fr', 'inventaire.io', 'openlibrary.org']);
    expect(await edition(await answerEdition(reopen(offline.fetch), kaamelott10))).toMatchObject(chosen);
    expect(offline.calls).toEqual([]);
  });

  test('the chosen Volume joins the Edition Line: Kaamelott 1 to 10', async () => {
    const { catalog } = setup();
    await choose(catalog, kaamelott10, kaamelott10Choice);

    const body = (await (await answerVolumes(catalog, kaamelott9, signedIn)).json()) as { volumes: Edition[] };

    expect(body.volumes.map((v) => v.volume)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(body.volumes.at(-1)?.sources).toEqual(['reader']);
  });

  test('an ISBN a source knows cannot be chosen', async () => {
    const { catalog } = setup();

    const response = await choose(catalog, kaamelott9, { ...kaamelott10Choice, volume: 9 });

    expect(response.status).toBe(409);
    expect((await edition(await answerEdition(catalog, kaamelott9))).sources).not.toContain('reader');
  });

  test('a later choice replaces the earlier one', async () => {
    const { catalog } = setup();
    await choose(catalog, kaamelott10, { ...kaamelott10Choice, volume: 11 });

    await choose(catalog, kaamelott10, kaamelott10Choice);

    expect((await edition(await answerEdition(catalog, kaamelott10))).volume).toBe(10);
  });

  test('a Work is taken from another Edition only when the sources share it', async () => {
    const { catalog } = setup();
    const hordeEdition = await edition(await answerEdition(catalog, horde));

    const shared = await choose(catalog, unknown, { anchor: horde, volume: null, title: 'La Horde du Contrevent', authors: [] });
    // BnF and SUDOC give "Réglez-lui son compte !" 2019 no shared Work: the reader types the book.
    const notShared = await choose(catalog, kaamelott10, { anchor: '9782265144026', volume: null, title: 'Réglez-lui son compte !', authors: [] });

    expect(shared.status).toBe(200);
    expect(await edition(shared)).toMatchObject({ work: hordeEdition.work, series: null, volume: null, sources: ['reader'] });
    expect(notShared.status).toBe(422);
    expect(await notShared.json()).toMatchObject({ reason: 'no-shared-work' });
    expect((await answerEdition(catalog, kaamelott10)).status).toBe(404);
  });

  test('a wrong choice is refused and stores nothing', async () => {
    const { catalog } = setup();

    expect((await choose(catalog, kaamelott10, kaamelott10Choice, { signedIn: false })).status).toBe(401);
    expect((await choose(catalog, kaamelott10, { ...kaamelott10Choice, title: '' })).status).toBe(400);
    expect((await choose(catalog, kaamelott10, { ...kaamelott10Choice, volume: -1 })).status).toBe(400);
    expect((await choose(catalog, kaamelott10, { ...kaamelott10Choice, anchor: unknown })).status).toBe(422);
    // La Horde has no Series: no Volume of it.
    expect((await choose(catalog, kaamelott10, { ...kaamelott10Choice, anchor: horde })).status).toBe(422);
    expect((await answerEdition(catalog, kaamelott10)).status).toBe(404);
  });

  test('the sources are asked again a day later; when one knows the ISBN, its Edition replaces the choice whole', async () => {
    let clock = new Date('2026-11-11T10:00:00.000Z');
    const sources = recordedFetch();
    // Open Library learns the ISBN: here it answers what it recorded for La Horde.
    let learnt = false;
    const fetch: SourceFetch = (url) =>
      sources.fetch(learnt && url.includes(`isbn=${kaamelott10}`) ? url.replace(kaamelott10, horde) : url);
    const catalog = createCatalog({ file: ':memory:', fetch, host: 'catalog.test', now: () => clock });
    open.push(catalog);
    await choose(catalog, kaamelott10, kaamelott10Choice);
    const asked = sources.calls.length;

    clock = new Date('2026-11-11T20:00:00.000Z');
    expect((await edition(await answerEdition(catalog, kaamelott10))).sources).toEqual(['reader']);
    expect(sources.calls).toHaveLength(asked);

    clock = new Date('2026-11-12T10:00:01.000Z');
    expect((await edition(await answerEdition(catalog, kaamelott10))).volume).toBe(10);
    expect(sources.calls.length).toBeGreaterThan(asked);

    learnt = true;
    clock = new Date('2026-11-13T10:00:02.000Z');
    const replaced = await edition(await answerEdition(catalog, kaamelott10));
    expect(replaced).toMatchObject({ sources: ['Open Library'], series: null, volume: null, work: { id: `isbn:${kaamelott10}` } });
    expect(replaced.title).not.toBe('Kaamelott 10');
  });

  test('when BnF is down, the answer says so', async () => {
    const { catalog } = setup(['catalogue.bnf.fr']);

    expect((await search(catalog, 'title=Kaamelott&publisher=Casterman')).status).toBe(503);
  });
});

describe('GET /api/catalog/editions/{isbn}/cover', () => {
  const onePieceCover = 'https://inventaire.io/img/entities/65883d822ab1b56d8f46aeb26c35d1feb9098a9b';
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
  const picture = (bytes: Uint8Array<ArrayBuffer> = jpeg, type = 'image/jpeg') =>
    new Response(bytes, { headers: { 'content-type': type } });

  test('the server fetches the cover once and serves it from SQLite, also after a restart', async () => {
    const asked: string[] = [];
    const { catalog, reopen } = setup([], (url) => {
      asked.push(url);
      return picture();
    });

    const first = await answerCover(catalog, onePiece56);
    const again = await answerCover(catalog, onePiece56);
    const offline = recordedFetch(['catalogue.bnf.fr', 'www.sudoc.fr', 'inventaire.io', 'openlibrary.org']);
    const afterRestart = await answerCover(reopen(offline.fetch), onePiece56);

    expect(first.status).toBe(200);
    expect(first.headers.get('content-type')).toBe('image/jpeg');
    expect(first.headers.get('x-content-type-options')).toBe('nosniff');
    // The service worker keeps it, and sign-out clears that; the HTTP cache would not be cleared.
    expect(first.headers.get('cache-control')).toBe('no-store');
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(jpeg);
    expect(new Uint8Array(await again.arrayBuffer())).toEqual(jpeg);
    expect(new Uint8Array(await afterRestart.arrayBuffer())).toEqual(jpeg);
    expect(asked).toEqual([onePieceCover]);
  });

  test.each<[string, () => Response]>([
    ['the source has no picture', () => new Response('', { status: 404 })],
    ['the answer is SVG, which can run scripts', () => picture(new TextEncoder().encode('<svg/>'), 'image/svg+xml')],
    ['the answer is a web page', () => picture(new TextEncoder().encode('<html>'), 'text/html')],
    ['the picture is over 2 MB', () => picture(new Uint8Array(2 * 1024 * 1024 + 1))],
  ])('no cover when %s, and it is asked again next time', async (_, answer) => {
    let asked = 0;
    const { catalog } = setup([], () => {
      asked++;
      return answer();
    });

    const response = await answerCover(catalog, onePiece56);
    await answerCover(catalog, onePiece56);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: 'NoCover' });
    expect(asked).toBe(2);
  });

  test('when the cover host is down, the answer says so', async () => {
    const { catalog } = setup([], () => new Response('down', { status: 503 }));

    const response = await answerCover(catalog, onePiece56);

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'SourcesUnavailable' });
  });

  test('an unknown ISBN has no cover; a wrong ISBN is refused', async () => {
    const { catalog } = setup([], () => picture());

    expect((await answerCover(catalog, unknown)).status).toBe(404);
    expect((await answerCover(catalog, '9782723478992')).status).toBe(400);
  });

  test.each([
    [onePieceCover, true],
    ['https://covers.openlibrary.org/b/id/12345-M.jpg', true],
    ['http://inventaire.io/img/entities/abc', false],
    ['https://inventaire.io.example.com/img/entities/abc', false],
    ['https://inventaire.io/api/entities?action=by-uris', false],
    ['https://127.0.0.1/img/entities/abc', false],
    ['https://example.com/cover.jpg', false],
  ])('only covers from the known cover hosts are fetched: %s', (url, allowed) => {
    expect(isCoverUrl(url)).toBe(allowed);
  });
});
