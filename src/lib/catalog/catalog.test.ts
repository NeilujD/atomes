import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { isSeriesId } from '../library/ids';
import { answerChoose, answerCorrect, answerCover, answerEdition, answerFindSeries, answerSearch, answerUncorrect, answerVolumes } from './api';
import type { Catalog, Edition, LineSummary, SearchFound, SeriesFound } from './catalog';
import { createCatalog } from './catalog';
import { fixtureDir, recordedFetch } from './recorded.fake';
import { isCoverUrl, type SourceFetch } from './sources';

const onePiece1 = '9782723488525'; // 2013 printing, in its own BnF Series record (43702987)
const onePiece56 = '9782723478991';
const onePiece112 = '9782344068922'; // 2026: no 461 in any source, 19 cm (56 is 18 x 12 cm)
const spyFamily16 = '9791042021030'; // 2026: BnF has no Series link yet, SUDOC has
const horde = '9782072927515'; // La Horde du Contrevent, Folio SF (owner's shelf)
const dragonBallSuper1to2 = '9782344025437'; // omnibus "Tomes 1-2", 461 $v "1-2"
const spyFamily1to3 = '9782380714487'; // omnibus "Tomes 1 à 3" in its own BnF Series record
const dragonBall1 = '9782723434621'; // 18 cm, known to SUDOC only: Series "Dragonball"
const dragonBallPerfect1 = '9782723467681'; // 21 cm line of 34 Volumes, BnF Series record 41495473
const dragonBall42 = '9782723449397'; // 18 cm, BnF Series "Dragon Ball." (two words)
// Dragon Ball, Glénat, 18 cm, BnF Series record 34338439 (1993 to 2000):
// Inventaire gives Volumes 2 to 4, 8, 10, 11 and more the one Work `sharedWork`.
const dragonBall1993: Record<number, string> = {
  1: '9782876952058',
  2: '9782876952065',
  3: '9782876952072',
  8: '9782876952188',
  10: '9782876952201',
  11: '9782876952218',
};
const sharedWork = 'inv:91e782c2fc0f67739836a22c452f3623';
const unknown = '9791099999993'; // valid check digit, no source knows it
const naruto1 = '9782871294146'; // publisher "Dargaud Bénélux-Kana" (1 to 22); BnF's ISBN search misses it
const naruto50 = '9782505009566'; // publisher "Kana" (23 on), same BnF Series record 38914962
// Owner's shelf (CORE-40): Kaamelott 10, Casterman. No source knows its ISBN; BnF has 1 to 9.
const kaamelott10 = '9782203255647';
const kaamelott9 = '9782203085053';
const asterixWhiteIris = '9781408730218'; // Sphere, 2023: SUDOC's Series is "Aterix", a typo
const asterixEmpire = '9782864976165'; // L'Empire du Milieu, album of the film: Inventaire's Series is wd:Q42490

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
  return { catalog, calls: sources.calls, reopen, file };
}

afterEach(() => {
  open.splice(0).forEach((catalog) => catalog.close());
  dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

const edition = async (response: Response) => (await response.json()) as Edition;

// A file from before the year and BnF Series record of each Edition (CORE-95).
const beforeLineRecords = 'alter table edition drop column year; alter table edition drop column bnf_id;';

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

  test.each([
    [dragonBallSuper1to2, [1, 2]],
    [spyFamily1to3, [1, 2, 3]],
  ])('an omnibus %s gives all its Volumes, and its first one as the Volume', async (isbn, volumes) => {
    const { catalog, reopen } = setup();

    const found = await edition(await answerEdition(catalog, isbn));
    const stored = await edition(await answerEdition(reopen(), isbn));

    expect(found).toMatchObject({ volumes, volume: 1 });
    expect(stored).toMatchObject({ volumes, volume: 1 });
  });

  test('a single Volume has one Volume in its list; a book with no Volume has none', async () => {
    const { catalog } = setup();

    expect(await edition(await answerEdition(catalog, onePiece56))).toMatchObject({ volumes: [56], volume: 56 });
    expect(await edition(await answerEdition(catalog, horde))).toMatchObject({ volumes: [], volume: null });
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

  test('a Catalog file from before omnibus Volumes opens; its Editions are fetched again, and kept when a source is down', async () => {
    const { catalog, reopen, file } = setup();
    await answerEdition(catalog, dragonBallSuper1to2);
    const old = new DatabaseSync(file);
    old.exec(`alter table edition drop column volumes; ${beforeLineRecords} pragma user_version = 2`);
    old.close();

    const offline = recordedFetch(['catalogue.bnf.fr', 'www.sudoc.fr', 'inventaire.io', 'openlibrary.org']);
    const kept = await edition(await answerEdition(reopen(offline.fetch), dragonBallSuper1to2));
    const online = recordedFetch();
    const fetched = await edition(await answerEdition(reopen(online.fetch), dragonBallSuper1to2));

    expect(offline.calls.length).toBeGreaterThan(0);
    expect(kept).toMatchObject({ volumes: [1], volume: 1 });
    expect(online.calls.length).toBeGreaterThan(0);
    expect(fetched).toMatchObject({ volumes: [1, 2], volume: 1 });
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

    const response = await answerVolumes(catalog, onePiece56, signedOut);
    const body = (await response.json()) as { series: Edition['series']; volumes: Edition[] };

    expect(response.status).toBe(200);
    expect(body.series).toEqual({ id: 'wd:Q673', title: 'One Piece', sameAs: [] });
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

    const body = (await (await answerVolumes(catalog, onePiece112, signedOut)).json()) as { series: Edition['series']; volumes: Edition[] };

    // 112 has no Series link in any source: its title finds the Series that 56 brought.
    expect(body.series).toEqual({ id: 'wd:Q673', title: 'One Piece', sameAs: [] });
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
    // The omnibus of Volumes 1 to 3 has its own BnF Series record: a fill leaves it out (CORE-41, Q1).
    expect(isbns).not.toContain(spyFamily1to3);
    expect(new Set(volumes.map((v) => v.series?.id)).size).toBe(1);
  });

  test('a fill that finds no other spelling of the Series title searches BnF by that title only (CORE-70)', async () => {
    for (const anchor of [spyFamily16, onePiece56]) {
      const { catalog, calls } = setup();

      await volumesOf(catalog, anchor);

      const searched = new Set(calls.filter((url) => url.includes('bib.title')).map((url) => new URL(url).searchParams.get('query')));
      expect(searched.size).toBe(1);
    }
  });

  test('an omnibus looked up enters the Edition Line once, next to its single Volumes', async () => {
    const { catalog } = setup();
    await volumesOf(catalog, spyFamily16);

    await answerEdition(catalog, spyFamily1to3);
    const volumes = await volumesOf(catalog, spyFamily16);

    expect(volumes.filter((v) => v.isbn === spyFamily1to3).map((v) => v.volumes)).toEqual([[1, 2, 3]]);
    expect(volumes.filter((v) => v.volume !== null && v.volume <= 3).map((v) => v.volumes)).toEqual([[1], [1, 2, 3], [2], [3]]);
  });

  test('BnF lists the omnibus Editions of an omnibus line, each once with all its Volumes', async () => {
    const { catalog } = setup();

    const volumes = await volumesOf(catalog, dragonBallSuper1to2);

    expect(volumes.map((v) => [v.isbn, v.volumes])).toEqual([
      [dragonBallSuper1to2, [1, 2]],
      ['9782344031940', [3, 4]],
      ['9782344037546', [5, 6]],
      ['9782344038130', [7, 8]],
    ]);
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

describe('Edition Lines by book size (ADR 0010, amendment 2026-11-12)', () => {
  const volumesOf = async (catalog: Catalog, isbn: string, access = signedIn) =>
    ((await (await answerVolumes(catalog, isbn, access)).json()) as { volumes: Edition[] }).volumes;
  const heights = (volumes: Edition[]) => new Set(volumes.map((v) => v.format?.match(/^\d+/)?.[0]));

  test('One Piece looked up from Volume 1 or from Volume 56 gives the same Volumes: 1 to 113 but 13', async () => {
    // Volume 1 names BnF Series record 43702987, 56 names 38888890, 98 to 100
    // name 46917823 and 105 on name none: one line, four records.
    const fromVolume1 = await volumesOf(setup().catalog, onePiece1);
    const fromVolume56 = await volumesOf(setup().catalog, onePiece56);

    const numbers = Array.from({ length: 113 }, (_, i) => i + 1).filter((n) => n !== 13);
    expect(fromVolume1.map((v) => v.volume)).toEqual(numbers);
    expect(fromVolume56.map((v) => v.volume)).toEqual(numbers);
    // Each line keeps the printing the reader looked up; Volume 1 has two.
    const others = (volumes: Edition[]) => volumes.filter((v) => v.volume !== 1).map((v) => v.isbn);
    expect(others(fromVolume56)).toEqual(others(fromVolume1));
    expect(fromVolume1[0].isbn).toBe(onePiece1);
    expect(fromVolume56[0].isbn).toBe('9782723433358');
    expect(heights(fromVolume1)).toEqual(new Set(['18', '19']));
  });

  test('books of the same Series title and size that are not the run lose their Volume number to the run', async () => {
    const volumes = await volumesOf(setup().catalog, onePiece1);
    const isbns = volumes.map((v) => v.isbn);

    // "500 quiz book" 2 and 3 (18 cm) and the arc box sets 1 to 6 (19 and 20 cm).
    for (const other of ['9782344015179', '9782344051993', '9782344050125', '9782344052006', '9782344058336', '9782344062685'])
      expect(isbns).not.toContain(other);
    expect(volumes.find((v) => v.volume === 2)?.isbn).toBe('9782723489898');
  });

  test('Dragon Ball looked up from Volume 1 (18 cm, "Dragonball") gives the 18 cm Volumes BnF files as "Dragon Ball"', async () => {
    const { catalog, calls } = setup();

    const volumes = await volumesOf(catalog, dragonBall1);

    // The 1993 line (BnF Series record 34338439): BnF lists no Volume 24 to
    // 26, and Volumes 5 to 7 under another publisher (Comics-USA).
    const numbers = Array.from({ length: 42 }, (_, i) => i + 1).filter((n) => (n < 5 || n > 7) && (n < 24 || n > 26));
    expect(volumes.map((v) => v.volume)).toEqual(numbers);
    expect(volumes[0].isbn).toBe(dragonBall1);
    expect(heights(volumes)).toEqual(new Set(['18']));
    expect(new Set(volumes.map((v) => v.publisher))).toEqual(new Set(['Glénat']));
    expect(new Set(volumes.map((v) => v.series?.id))).toEqual(new Set([volumes[0].series?.id]));
    // The search by "Dragonball" finds BnF's Series records titled "Dragon
    // Ball"; that spelling is searched once more, and no other.
    const searched = new Set(calls.filter((url) => url.includes('bib.title')).map((url) => new URL(url).searchParams.get('query')));
    expect(searched).toEqual(new Set(['bib.title all "Dragonball" and bib.publisher all "Glénat"', 'bib.title all "Dragon Ball" and bib.publisher all "Glénat"']));
  });

  test('Dragon Ball SD, Super, Z and the Comics-USA printings stay out of the Dragon Ball line', async () => {
    const isbns = (await volumesOf(setup().catalog, dragonBall1)).map((v) => v.isbn);

    // SD 12, Super 1, Z 7th part 1 (all Glénat, 18 cm), and Volume 7 by Comics-USA.
    for (const other of ['9782344076446', '9782344019887', '9782344005378', '9782876952171']) expect(isbns).not.toContain(other);
  });

  test('a Volume BnF files as "Dragon Ball" joins the Series SUDOC names "Dragonball"', async () => {
    const { catalog } = setup();
    const first = await edition(await answerEdition(catalog, dragonBall1));

    const later = await edition(await answerEdition(catalog, dragonBall42));

    expect(later.series?.id).toBe(first.series?.id);
  });

  test('the 21 cm Volumes form their own Edition Line from a 21 cm anchor, in the same Series', async () => {
    const { catalog } = setup();
    const standard = await volumesOf(catalog, dragonBall1);

    const perfect = await volumesOf(catalog, dragonBallPerfect1);

    // 31 Volumes BnF files as "Dragonball", and Volume 21 it files as "Dragon Ball perfect edition".
    expect(perfect).toHaveLength(32);
    expect(perfect.find((v) => v.volume === 21)?.isbn).toBe('9782723486729');
    expect(heights(perfect)).toEqual(new Set(['21']));
    expect(perfect.map((v) => v.isbn)).not.toContain(dragonBall1);
    expect(perfect[0].series?.id).toBe(standard[0].series?.id);
  });
});

describe('One Edition Line under two publisher names (ADR 0010, amendment 2026-11-13)', () => {
  const volumesOf = async (catalog: Catalog, isbn: string, access = signedIn) =>
    ((await (await answerVolumes(catalog, isbn, access)).json()) as { volumes: Edition[] }).volumes;

  test('Naruto looked up from Volume 1 ("Dargaud Bénélux-Kana") gives the Volumes BnF files under "Kana": 1 to 72 but 20', async () => {
    const volumes = await volumesOf(setup().catalog, naruto1);

    // BnF has no record of Volume 20 in this line.
    expect(volumes.map((v) => v.volume)).toEqual(Array.from({ length: 72 }, (_, i) => i + 1).filter((n) => n !== 20));
    expect(volumes[0].isbn).toBe(naruto1);
    expect(volumes.find((v) => v.volume === 50)?.isbn).toBe(naruto50);
    expect(new Set(volumes.map((v) => v.publisher))).toEqual(new Set(['Dargaud Bénélux-Kana', 'Kana']));
  });

  test('a Volume looked up under the other name joins the same Edition Line', async () => {
    const { catalog } = setup();
    await answerEdition(catalog, naruto50);
    await answerEdition(catalog, naruto1);

    expect((await volumesOf(catalog, naruto1, signedOut)).map((v) => v.isbn)).toEqual([naruto1, naruto50]);
  });
});

describe('One Work per Volume number (ADR 0010, amendment 2026-11-14)', () => {
  const volumesOf = async (catalog: Catalog, isbn: string, access = signedIn) =>
    ((await (await answerVolumes(catalog, isbn, access)).json()) as { volumes: Edition[] }).volumes;

  test('two Volumes Inventaire gives one Work each get their own Work, whatever the lookup order', async () => {
    const { catalog } = setup();
    const first = await edition(await answerEdition(catalog, dragonBall1993[2]));
    expect(first.work.id).toBe(sharedWork);

    const second = await edition(await answerEdition(catalog, dragonBall1993[3]));

    expect(second.work).toEqual({ id: `isbn:${dragonBall1993[3]}`, title: second.title });
    expect((await edition(await answerEdition(catalog, dragonBall1993[2]))).work.id).toBe(`isbn:${dragonBall1993[2]}`);
    // Volume 1 has a Work of its own: it keeps it.
    expect((await edition(await answerEdition(catalog, dragonBall1993[1]))).work.id).toBe('inv:31cee958a93ba50697a3fec2a32fc0c0');
  });

  test('a fill applies the rule: no Volume of the line keeps the shared Work, the others keep theirs', async () => {
    const { catalog } = setup();

    const volumes = await volumesOf(catalog, dragonBall1993[2]);

    expect(volumes.filter((v) => v.work.id === sharedWork)).toEqual([]);
    for (const volume of [2, 3, 4, 12, 20, 36]) {
      const found = volumes.find((v) => v.volume === volume)!;
      expect(found.work.id).toBe(`isbn:${found.isbn}`);
    }
    expect(volumes.find((v) => v.volume === 1)?.work.id).toBe('inv:31cee958a93ba50697a3fec2a32fc0c0');
    expect(volumes.find((v) => v.volume === 16)?.work.id).toBe('inv:1c3247b1dd00451b0a08f49db15fc530');
  });

  test('the dropped Work stays dropped when an Edition is fetched again a month later', async () => {
    const { file } = setup();
    const at = (iso: string) => {
      const catalog = createCatalog({ file, fetch: recordedFetch().fetch, host: 'catalog.test', now: () => new Date(iso) });
      open.push(catalog);
      return catalog;
    };
    const before = at('2026-11-14T12:00:00.000Z');
    await answerEdition(before, dragonBall1993[2]);
    await answerEdition(before, dragonBall1993[3]);

    const later = at('2026-12-20T12:00:00.000Z');
    const again = await edition(await answerEdition(later, dragonBall1993[2]));

    expect(again.fetchedAt).toBe('2026-12-20T12:00:00.000Z');
    expect(again.work.id).toBe(`isbn:${dragonBall1993[2]}`);
    // A Volume looked up for the first time after the drop does not get it either.
    expect((await edition(await answerEdition(later, dragonBall1993[8]))).work.id).toBe(`isbn:${dragonBall1993[8]}`);
  });

  test('an answer not stored, a source being down, follows the rule too', async () => {
    const { catalog, reopen } = setup();
    await answerEdition(catalog, dragonBall1993[2]);
    await answerEdition(catalog, dragonBall1993[3]);

    const found = await edition(await answerEdition(reopen(recordedFetch(['www.sudoc.fr']).fetch), dragonBall1993[10]));

    expect(found.work.id).toBe(`isbn:${dragonBall1993[10]}`);
  });

  test('a Catalog file from before the rule drops the shared Works it holds, once and for good (migration)', async () => {
    const { catalog, file, reopen } = setup();
    for (const volume of [1, 2, 3]) await answerEdition(catalog, dragonBall1993[volume]);
    catalog.close();
    open.splice(open.indexOf(catalog), 1);
    // The file as the Catalog of main left it: the shared Work on each Volume, no dropped Work.
    const old = new DatabaseSync(file);
    old.prepare('update edition set work_id = ? where isbn != ?').run(sharedWork, dragonBall1993[1]);
    old.exec(`drop table dropped_work; ${beforeLineRecords} pragma user_version = 6`);
    old.close();

    const offline = recordedFetch(['catalogue.bnf.fr', 'www.sudoc.fr', 'inventaire.io', 'openlibrary.org']);
    const migrated = createCatalog({ file, fetch: offline.fetch, host: 'catalog.test' });
    open.push(migrated);

    expect((await edition(await answerEdition(migrated, dragonBall1993[2]))).work.id).toBe(`isbn:${dragonBall1993[2]}`);
    expect((await edition(await answerEdition(migrated, dragonBall1993[3]))).work.id).toBe(`isbn:${dragonBall1993[3]}`);
    expect((await edition(await answerEdition(migrated, dragonBall1993[1]))).work.id).toBe('inv:31cee958a93ba50697a3fec2a32fc0c0');
    expect(offline.calls).toEqual([]);
    // Remembered: Volume 8, looked up later, does not get the Work.
    expect((await edition(await answerEdition(reopen(), dragonBall1993[8]))).work.id).toBe(`isbn:${dragonBall1993[8]}`);
  });
});


describe('Overlapping BnF Series records are separate Edition Lines (ADR 0010, amendment 2026-11-14)', () => {
  type Answer = { volumes: Edition[]; lines: LineSummary[] };
  const answerOf = async (catalog: Catalog, isbn: string, access = signedIn) =>
    (await (await answerVolumes(catalog, isbn, access)).json()) as Answer;
  const names = (lines: LineSummary[]) => lines.map(({ publisher, first, last }) => `${publisher} ${first}-${last}`);

  test('Dragon Ball 18 cm gives three Edition Lines, named by their years', async () => {
    const { catalog } = setup();

    const { lines } = await answerOf(catalog, dragonBall1993[2]);

    // Volume 41 has only a 2008 printing in 34338439: it stays in the 1993 line (Series Correction, ADR 0017).
    expect(names(lines)).toEqual(['Glénat 1993-2008', 'Glénat 2001-2004', 'Glénat 2003-2008']);
    const second = await answerOf(catalog, lines[1].anchor, signedOut);
    expect(second.volumes.map((v) => v.volume)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
    expect(new Set(second.volumes.map((v) => v.year))).toEqual(new Set([2001, 2002, 2003, 2004]));
    // 39250101 lists no Volume 8 to 10, and gives Volumes 7 and 11 one ISBN: one Edition, no failure.
    const third = await answerOf(catalog, lines[2].anchor, signedOut);
    expect(third.volumes.filter((v) => v.isbn === '9782723448376')).toHaveLength(1);
    expect(third.volumes.map((v) => v.volume)).toEqual([3, 4, 5, 6, 7, ...Array.from({ length: 10 }, (_, i) => i + 12)]);
  });

  test('in 34338439 each Volume keeps the printing nearest the median year: Volumes 8 to 11 are the 1994 to 1996 ones', async () => {
    const { volumes } = await answerOf(setup().catalog, dragonBall1993[2]);

    const printings = volumes.filter((v) => v.volume !== null && v.volume >= 8 && v.volume <= 11);
    expect(printings.map((v) => [v.volume, v.year])).toEqual([
      [8, 1994],
      [9, 1994],
      [10, 1996],
      [11, 1996],
    ]);
    expect(printings.map((v) => v.isbn)).toEqual(expect.arrayContaining([dragonBall1993[8], dragonBall1993[10], dragonBall1993[11]]));
    expect(volumes.find((v) => v.volume === 42)?.year).toBe(2000);
  });

  test('Dragon Ball 1, known to SUDOC only, joins the 1993 line; the other lines are not filled again', async () => {
    const { catalog, calls } = setup();

    const { volumes, lines } = await answerOf(catalog, dragonBall1);
    const searches = calls.length;

    expect(volumes[0].isbn).toBe(dragonBall1);
    expect(volumes.map((v) => v.volume)).toEqual([1, 2, 3, 4, ...Array.from({ length: 16 }, (_, i) => i + 8), ...Array.from({ length: 16 }, (_, i) => i + 27)]);
    expect(lines).toHaveLength(3);
    for (const { anchor } of lines) await answerOf(catalog, anchor);
    expect(calls).toHaveLength(searches);
  });

  test('One Piece 18 cm stays one line, with 43702987 (Volume 1) and 46917823 (Volumes 98 to 100)', async () => {
    const { volumes, lines } = await answerOf(setup().catalog, onePiece1);

    expect(volumes.map((v) => v.volume)).toEqual(Array.from({ length: 113 }, (_, i) => i + 1).filter((n) => n !== 13));
    expect(volumes[0].isbn).toBe(onePiece1);
    expect(lines.find(({ anchor }) => volumes.some((v) => v.isbn === anchor))).toMatchObject({ publisher: 'Glénat' });
  });

  test('a Catalog file from before fills each mixed line again; the anchor of a follow finds the line of its record (migration)', async () => {
    const { catalog, file } = setup();
    const before = await answerOf(catalog, dragonBall1993[2]);
    const followed = before.lines[1].anchor; // Volume 1 of the 2001 edition
    catalog.close();
    open.splice(open.indexOf(catalog), 1);
    // The file as the Catalog of main left it: one line of four parts for the three editions, filled.
    const old = new DatabaseSync(file);
    const { edition_line: line } = old.prepare('select edition_line from edition where isbn = ?').get(followed) as { edition_line: string };
    const key = line.split('|').slice(0, 4).join('|');
    old.prepare('update edition set edition_line = ? where edition_line like ?').run(key, `${key}|%`);
    old.prepare('delete from line_fill').run();
    old.prepare('insert into line_fill (edition_line, filled_at) values (?, ?)').run(key, new Date().toISOString());
    old.exec(`${beforeLineRecords} pragma user_version = 7`);
    old.close();
    const sources = recordedFetch();
    const migrated = createCatalog({ file, fetch: sources.fetch, host: 'catalog.test' });
    open.push(migrated);
    expect((await answerOf(migrated, followed, signedOut)).volumes.length).toBeGreaterThan(50);

    const after = await answerOf(migrated, followed);

    expect(after.volumes.map((v) => v.volume)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
    expect(after.volumes[0].isbn).toBe(followed);
    expect(names(after.lines)).toEqual(['Glénat 1993-2008', 'Glénat 2001-2004', 'Glénat 2003-2008']);
  });

  test('Naruto (Kana) stays one line', async () => {
    const { volumes, lines } = await answerOf(setup().catalog, naruto1);

    expect(volumes).toHaveLength(71);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ publisher: 'Kana', first: 2002 });
  });
});

describe('A Catalog file from before book sizes (migration)', () => {
  const volumesOf = async (catalog: Catalog, isbn: string, access = signedIn) =>
    ((await (await answerVolumes(catalog, isbn, access)).json()) as { volumes: Edition[] }).volumes;

  // The file as the Catalog of main left it: Dragon Ball 1 (18 cm) looked up
  // first (its fill found no 18 cm Volume before CORE-70), then the 21 cm
  // Volumes in its line, the line filled.
  async function mixedFile() {
    const { catalog, file } = setup();
    await volumesOf(catalog, dragonBall1, signedOut);
    await volumesOf(catalog, dragonBallPerfect1);
    catalog.close();
    open.splice(open.indexOf(catalog), 1);
    // Its key had no size: one Series, publisher and language.
    const old = new DatabaseSync(file);
    const rows = old.prepare('select isbn, edition_line from edition where edition_line is not null').all() as { isbn: string; edition_line: string }[];
    for (const row of rows)
      old.prepare('update edition set edition_line = ? where isbn = ?').run(row.edition_line.split('|').slice(0, 3).join('|'), row.isbn);
    old.prepare('delete from line_fill').run();
    old.prepare('insert into line_fill (edition_line, filled_at) values (?, ?)').run(rows[0].edition_line.split('|').slice(0, 3).join('|'), new Date().toISOString());
    old.exec(`${beforeLineRecords} pragma user_version = 3`);
    old.close();
    return file;
  }

  test('splits a line by book size, from the first Edition looked up', async () => {
    const file = await mixedFile();
    const catalog = createCatalog({ file, fetch: recordedFetch().fetch, host: 'catalog.test' });
    open.push(catalog);

    expect((await volumesOf(catalog, dragonBall1, signedOut)).map((v) => v.isbn)).toEqual([dragonBall1]);
    const perfect = await volumesOf(catalog, dragonBallPerfect1, signedOut);
    expect(perfect.length).toBeGreaterThanOrEqual(32);
    expect(new Set(perfect.map((v) => v.format?.match(/^\d+/)?.[0]))).toEqual(new Set(['21']));
  });

  test('every Edition Line filled before fills again at its next ask, once', async () => {
    const file = await mixedFile();
    const sources = recordedFetch();
    const catalog = createCatalog({ file, fetch: sources.fetch, host: 'catalog.test' });
    open.push(catalog);
    const searches = () => sources.calls.filter((url) => url.includes('bib.title')).length;

    await volumesOf(catalog, dragonBall1);
    const asked = searches();
    await volumesOf(catalog, dragonBall1);

    // Two pages of the BnF search by "Dragonball", four by "Dragon Ball", then none.
    expect(asked).toBe(6);
    expect(searches()).toBe(asked);
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

describe('Series Correction (ADR 0017)', () => {
  type Answer = { volumes: Edition[]; lines: LineSummary[] };
  const account = 'did:plc:reader-who-corrects';
  const answerOf = async (catalog: Catalog, isbn: string, access = signedIn) =>
    (await (await answerVolumes(catalog, isbn, access)).json()) as Answer;
  const names = (lines: LineSummary[]) => lines.map(({ publisher, first, last }) => `${publisher} ${first}-${last}`);

  // A Catalog with a clock, to fill an Edition Line again a week later.
  function clocked() {
    let clock = new Date('2026-11-15T10:00:00.000Z');
    const dir = mkdtempSync(join(tmpdir(), 'atomes-catalog-'));
    dirs.push(dir);
    const file = join(dir, 'catalog.sqlite');
    const sources = recordedFetch();
    const make = () => {
      const catalog = createCatalog({ file, fetch: sources.fetch, host: 'catalog.test', now: () => clock });
      open.push(catalog);
      return catalog;
    };
    return {
      catalog: make(),
      reopen: make,
      calls: sources.calls,
      later: (days: number) => (clock = new Date(clock.getTime() + days * 24 * 3600 * 1000)),
    };
  }

  // Dragon Ball 18 cm, filled: Volume 41 has only a 2008 printing, in the 1993 line (BnF record 34338439).
  async function dragonBall(catalog: Catalog) {
    const { volumes, lines } = await answerOf(catalog, dragonBall1993[2]);
    const volume41 = volumes.find((v) => v.volume === 41)!;
    return { volume41: volume41.isbn, line1993: lines[0].anchor, line2003: lines[2].anchor };
  }

  test('Dragon Ball 41 (2008 printing) moves to the 2003–08 line, and stays there after the line fills again', async () => {
    const { catalog, later, calls } = clocked();
    const { volume41, line1993, line2003 } = await dragonBall(catalog);

    const response = await answerCorrect(catalog, volume41, { anchor: line2003, volume: 41 }, account);

    expect(response.status).toBe(200);
    expect(await edition(response)).toMatchObject({ isbn: volume41, volume: 41, corrected: true });
    expect((await answerOf(catalog, line2003)).volumes.find((v) => v.volume === 41)?.isbn).toBe(volume41);
    expect((await answerOf(catalog, line1993)).volumes.some((v) => v.isbn === volume41)).toBe(false);

    later(8);
    const searches = calls.length;
    const again = await answerOf(catalog, line1993);
    const after = await answerOf(catalog, line2003);

    expect(calls.length).toBeGreaterThan(searches);
    expect(again.volumes.some((v) => v.isbn === volume41)).toBe(false);
    expect(after.volumes.filter((v) => v.volume === 41).map((v) => v.isbn)).toEqual([volume41]);
    expect(names(after.lines)).toEqual(['Glénat 1993-2000', 'Glénat 2001-2004', 'Glénat 2003-2008']);
  });

  test('a book scanned for a Volume the line lacks (CORE-108) fills the gap, and stays there after the line fills again', async () => {
    const { catalog, later } = clocked();
    const { line1993 } = await dragonBall(catalog);
    expect((await answerOf(catalog, line1993)).volumes.some((v) => v.volume === 5)).toBe(false);
    const scanned = '9781408730218'; // Asterix and the White Iris: a book a source knows, standing in for Dragon Ball 5

    expect((await answerCorrect(catalog, scanned, { anchor: line1993, volume: 5 }, account)).status).toBe(200);
    later(8);

    const after = await answerOf(catalog, line1993);
    expect(after.volumes.filter((v) => v.volume === 5).map((v) => v.isbn)).toEqual([scanned]);
  });

  test('every reader gets the Correction, also after a restart; no answer holds the Account', async () => {
    const { catalog, reopen } = clocked();
    const { volume41, line2003 } = await dragonBall(catalog);

    const corrected = await answerCorrect(catalog, volume41, { anchor: line2003, volume: 41 }, account);
    const again = reopen();
    const answers = [corrected, await answerEdition(again, volume41), await answerVolumes(again, line2003, signedOut)];

    expect(await edition(await answerEdition(again, volume41))).toMatchObject({ volume: 41, corrected: true });
    for (const answer of answers) expect(await answer.text()).not.toContain(account);
  });

  test('a later Correction replaces the earlier one; "Back to the sources" gives the source data back', async () => {
    const { catalog } = clocked();
    const { volume41, line1993, line2003 } = await dragonBall(catalog);
    const before = await edition(await answerEdition(catalog, volume41));
    await answerCorrect(catalog, volume41, { anchor: line2003, volume: 40 }, account);

    await answerCorrect(catalog, volume41, { anchor: line1993, volume: 43 }, 'did:plc:another-reader');

    expect(await edition(await answerEdition(catalog, volume41))).toMatchObject({ volume: 43, volumes: [43], corrected: true });
    const back = answerUncorrect(catalog, volume41);
    expect(back.status).toBe(200);
    expect(await edition(back)).toEqual(before);
    expect((await answerOf(catalog, line1993)).volumes.find((v) => v.volume === 41)?.isbn).toBe(volume41);
    expect((await answerOf(catalog, line2003)).volumes.some((v) => v.isbn === volume41)).toBe(false);
  });

  test('a new Series for a book with none: minted identifier, its first Edition Line, found by its title', async () => {
    const { catalog } = clocked();
    const novel = '9782265144026'; // "Réglez-lui son compte !", San-Antonio, Fleuve noir: no Series
    await answerEdition(catalog, novel);
    const newSeries = { title: 'San-Antonio', publisher: 'Fleuve noir', language: 'fre', height: 18 };

    const created = await edition(await answerCorrect(catalog, novel, { newSeries, volume: 52 }, account));
    // Another book joins it, in its Edition Line.
    const joined = await edition(await answerCorrect(catalog, horde, { anchor: novel, volume: 1 }, account));

    expect(created.series?.id).toMatch(/^atomes:catalog\.test:[0-9A-Z]{26}$/);
    expect(created).toMatchObject({ series: { title: 'San-Antonio', sameAs: [] }, volume: 52, corrected: true });
    expect(joined.series).toEqual(created.series);
    expect((await answerOf(catalog, novel)).volumes.map((v) => [v.isbn, v.volume])).toEqual([
      [horde, 1],
      [novel, 52],
    ]);
    const found = (await findSeries(catalog, 'title=san%20antonio').json()) as { series: SeriesFound[] };
    expect(found.series).toMatchObject([{ series: created.series, lines: [{ anchor: horde, first: 2007, last: 2019 }] }]);
    expect(found.series[0].lines).toHaveLength(1);
  });

  test('two Series linked by hand keep the Corrections into either', async () => {
    const { catalog } = clocked();
    const newSeries = { title: 'Horde', publisher: 'Folio', language: 'fre', height: 18 };
    const created = await edition(await answerCorrect(catalog, horde, { newSeries, volume: 1 }, account));
    const onePiece = await edition(await answerEdition(catalog, onePiece56));

    const linked = catalog.link(created.series!.id, onePiece.series!.id)!;

    expect(await edition(await answerEdition(catalog, horde))).toMatchObject({ series: linked, volume: 1, corrected: true });
    expect(catalog.lines(onePiece).map(({ anchor }) => anchor)).toContain(horde);
  });

  test('an omnibus moved with its Volume number kept keeps every Volume it holds; another number makes it one Volume', async () => {
    const { catalog } = clocked();
    await answerEdition(catalog, onePiece56);
    await answerEdition(catalog, dragonBallSuper1to2);

    const moved = await edition(await answerCorrect(catalog, dragonBallSuper1to2, { anchor: onePiece56, volume: 1 }, account));

    expect(moved).toMatchObject({ volume: 1, volumes: [1, 2], corrected: true });
    expect((await answerOf(catalog, onePiece56, signedOut)).volumes.find((v) => v.isbn === dragonBallSuper1to2)?.volumes).toEqual([1, 2]);
    const renumbered = await edition(await answerCorrect(catalog, dragonBallSuper1to2, { anchor: onePiece56, volume: 3 }, account));
    expect(renumbered).toMatchObject({ volume: 3, volumes: [3] });
  });

  // Dragon Ball 2 and 3 (1993): Inventaire gives them one Work (ADR 0010, amendment 2026-11-14).
  const [volume2, volume3] = [dragonBall1993[2], dragonBall1993[3]];
  const elsewhere = { title: 'Dragon Ball kanzenban', publisher: 'Glénat', language: 'fre', height: 18 };
  const workOf = async (catalog: Catalog, isbn: string) => (await edition(await answerEdition(catalog, isbn))).work.id;

  test('one Work per Volume number counts where readers see the Edition: out of the Series, then into it', async () => {
    const { catalog } = clocked();
    await answerEdition(catalog, volume2);
    await answerCorrect(catalog, volume2, { newSeries: elsewhere, volume: 2 }, account);

    // Volume 2 is no longer in the Series of Volume 3: Volume 3 keeps the Work.
    expect(await workOf(catalog, volume3)).toBe(sharedWork);

    await answerCorrect(catalog, volume3, { anchor: volume2, volume: 3 }, account);

    expect(await workOf(catalog, volume2)).toBe(`isbn:${volume2}`);
    expect(await workOf(catalog, volume3)).toBe(`isbn:${volume3}`);
  });

  test('one Work per Volume number counts again when a Correction goes "Back to the sources"', async () => {
    const { catalog } = clocked();
    await answerEdition(catalog, volume2);
    await answerCorrect(catalog, volume2, { newSeries: elsewhere, volume: 2 }, account);
    expect(await workOf(catalog, volume3)).toBe(sharedWork);

    answerUncorrect(catalog, volume2);

    expect(await workOf(catalog, volume2)).toBe(`isbn:${volume2}`);
    expect(await workOf(catalog, volume3)).toBe(`isbn:${volume3}`);
  });

  test('when a source is down for a book the Catalog does not hold yet, the answer says so and nothing is kept', async () => {
    const { catalog, reopen } = setup(['inventaire.io']);
    await answerEdition(catalog, onePiece56);

    const response = await answerCorrect(catalog, horde, { anchor: onePiece56, volume: 1 }, account);

    expect(response.status).toBe(503);
    expect((await edition(await answerEdition(reopen(), horde))).corrected).toBeUndefined();
  });

  test('a wrong Correction is refused and stores nothing', async () => {
    const { catalog } = clocked();
    const onePiece = await edition(await answerEdition(catalog, onePiece56));
    const correct = (isbn: string, body: unknown) => answerCorrect(catalog, isbn, body, account);
    const newSeries = { title: 'Horde', publisher: 'Folio', language: 'fre', height: null };

    const statuses = [
      await correct('978', { anchor: onePiece56, volume: 1 }),
      await correct(horde, { anchor: onePiece56, volume: -1 }),
      await correct(horde, { anchor: onePiece56, volume: 10_000 }),
      await correct(horde, { anchor: onePiece56 }),
      await correct(horde, { anchor: '9782723478992', volume: 1 }),
      await correct(horde, { anchor: onePiece56, newSeries, volume: 1 }),
      await correct(horde, { newSeries: { ...newSeries, title: ' ' }, volume: 1 }),
      await correct(horde, { newSeries: { ...newSeries, publisher: 'a'.repeat(301) }, volume: 1 }),
      await correct(horde, { newSeries: { ...newSeries, language: 'french' }, volume: 1 }),
      await correct(horde, { newSeries: { ...newSeries, height: 'tall' }, volume: 1 }),
      await correct(unknown, { anchor: onePiece56, volume: 1 }),
      await correct(horde, { anchor: kaamelott10, volume: 1 }),
      await correct(onePiece56, { anchor: horde, volume: 1 }),
    ].map(({ status }) => status);

    expect(statuses).toEqual([400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 404, 422, 422]);
    expect((await edition(await answerEdition(catalog, horde))).corrected).toBeUndefined();
    expect(await edition(await answerEdition(catalog, onePiece56))).toEqual(onePiece);
    expect(answerUncorrect(catalog, unknown).status).toBe(404);
  });

  test('the Series search is for signed-in readers, by a title', async () => {
    const { catalog } = clocked();
    const onePiece = await edition(await answerEdition(catalog, onePiece56));

    const found = (await findSeries(catalog, 'title=ONE%20pi%C3%A8ce').json()) as { series: SeriesFound[] };

    expect(found.series.map(({ series }) => series)).toEqual([onePiece.series]);
    expect(findSeries(catalog, 'title=one', { signedIn: false }).status).toBe(401);
    expect(findSeries(catalog, 'title=%20').status).toBe(400);
    expect(findSeries(catalog, `title=${'a'.repeat(301)}`).status).toBe(400);
  });

  const findSeries = (catalog: Catalog, query: string, access = { signedIn: true }) =>
    answerFindSeries(catalog, new URL(`http://atomes.test/api/catalog/series?${query}`), access);
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

describe('One Series across sources and identifiers (same_as, ADR 0010)', () => {
  const volumesOf = async (catalog: Catalog, isbn: string) =>
    ((await (await answerVolumes(catalog, isbn, signedOut)).json()) as { series: Edition['series']; volumes: Edition[] });

  test('a shared identifier that comes after a minted one is linked: both give one Series and its Volumes', async () => {
    const { catalog } = setup();
    // One Piece 112 has no Series link in any source: the Catalog mints an identifier.
    const minted = (await edition(await answerEdition(catalog, onePiece112))).series!.id;
    expect(minted).toMatch(/^atomes:catalog\.test:/);

    // One Piece 56 brings Wikidata's identifier and joins the Series by title.
    const found = await edition(await answerEdition(catalog, onePiece56));

    expect(found.series).toEqual({ id: 'wd:Q673', title: 'One Piece', sameAs: [minted] });
    expect(catalog.series('wd:Q673')).toEqual(found.series);
    expect(catalog.series(minted)).toEqual(found.series);
    for (const isbn of [onePiece56, onePiece112]) {
      const body = await volumesOf(catalog, isbn);
      expect(body.series).toEqual(found.series);
      expect(body.volumes.map((v) => [v.isbn, v.volume, v.series?.id])).toEqual([
        [onePiece56, 56, 'wd:Q673'],
        [onePiece112, 112, 'wd:Q673'],
      ]);
    }
  });

  test('the link and the BnF Series record stay after a restart', async () => {
    const { catalog, reopen } = setup();
    const minted = (await edition(await answerEdition(catalog, onePiece112))).series!.id;
    await answerEdition(catalog, onePiece56);

    const offline = recordedFetch(['catalogue.bnf.fr', 'www.sudoc.fr', 'inventaire.io', 'openlibrary.org']);
    const again = reopen(offline.fetch);

    expect(again.series(minted)).toEqual({ id: 'wd:Q673', title: 'One Piece', sameAs: [minted] });
    expect((await edition(await answerEdition(again, onePiece112))).series?.id).toBe('wd:Q673');
    expect(offline.calls).toEqual([]);
  });

  test('a Series with another shared identifier stays another Series, even with the same title and BnF record', async () => {
    let clock = new Date('2026-11-11T10:00:00.000Z');
    const sources = recordedFetch();
    // The recorded answers, edited: Wikidata first names the Series of One
    // Piece 56 wd:Q99999, then fixes it to wd:Q673.
    let fixed = false;
    const fetch: SourceFetch = async (url) => {
      if (fixed) return sources.fetch(url);
      const answer = await sources.fetch(url.replace('wd%3AQ99999', 'wd%3AQ673'));
      return new Response((await answer.text()).replaceAll('wd:Q673', 'wd:Q99999'), { status: answer.status });
    };
    const catalog = createCatalog({ file: ':memory:', fetch, host: 'catalog.test', now: () => clock });
    open.push(catalog);
    expect((await edition(await answerEdition(catalog, onePiece56))).series?.id).toBe('wd:Q99999');

    fixed = true;
    clock = new Date('2026-12-12T10:00:00.000Z'); // after a month the Edition is fetched again
    const found = await edition(await answerEdition(catalog, onePiece56));

    expect(found.series).toEqual({ id: 'wd:Q673', title: 'One Piece', sameAs: [] });
    expect(catalog.series('wd:Q99999')).toEqual({ id: 'wd:Q99999', title: 'One Piece', sameAs: [] });
  });

  test('a shared identifier that names two Series of this Catalog makes them one', async () => {
    const sources = recordedFetch();
    // The recorded answers, edited: at first BnF is down and Inventaire labels
    // wd:Q673 "Wan Pīsu", so it does not join the Series minted for 112.
    let edited = true;
    const fetch: SourceFetch = async (url) => {
      if (!edited) return sources.fetch(url);
      if (url.includes('catalogue.bnf.fr')) return new Response('down', { status: 503 });
      const answer = await sources.fetch(url);
      return new Response((await answer.text()).replaceAll('"One Piece"', '"Wan Pīsu"'), { status: answer.status });
    };
    const catalog = createCatalog({ file: ':memory:', fetch, host: 'catalog.test', now: () => new Date('2026-11-11T10:00:00.000Z') });
    open.push(catalog);
    edited = false;
    const minted = (await edition(await answerEdition(catalog, onePiece112))).series!.id;
    edited = true;
    expect((await edition(await answerEdition(catalog, onePiece56))).series).toMatchObject({ id: 'wd:Q673', title: 'Wan Pīsu' });
    expect(catalog.series(minted)?.id).toBe(minted);

    edited = false;
    const found = await edition(await answerEdition(catalog, onePiece56));

    expect(found.series).toEqual({ id: 'wd:Q673', title: 'One Piece', sameAs: [minted] });
    expect(catalog.series(minted)).toEqual(found.series);
    const body = (await (await answerVolumes(catalog, onePiece112, signedOut)).json()) as { volumes: Edition[] };
    expect(body.volumes.map((v) => [v.isbn, v.series?.id])).toEqual([
      [onePiece56, 'wd:Q673'],
      [onePiece112, 'wd:Q673'],
    ]);
  });

  test('two Series linked by hand are one: best identifier, its title, every Volume; the old title still joins', async () => {
    let clock = new Date('2026-11-11T10:00:00.000Z');
    const catalog = createCatalog({ file: ':memory:', fetch: recordedFetch().fetch, host: 'catalog.test', now: () => clock });
    open.push(catalog);
    // SUDOC's Series of Asterix and the White Iris is "Aterix", with no shared identifier.
    const aterix = (await edition(await answerEdition(catalog, asterixWhiteIris))).series!;
    expect(aterix).toMatchObject({ id: expect.stringMatching(/^atomes:catalog\.test:/) as string, title: 'Aterix' });
    // Inventaire gives Astérix (wd:Q42490) for the album of the film L'Empire du Milieu.
    expect((await edition(await answerEdition(catalog, asterixEmpire))).series?.id).toBe('wd:Q42490');

    const linked = catalog.link(aterix.id, 'wd:Q42490');

    expect(linked).toEqual({ id: 'wd:Q42490', title: 'Astérix', sameAs: [aterix.id] });
    expect(catalog.series(aterix.id)).toEqual(linked);
    const body = (await (await answerVolumes(catalog, asterixWhiteIris, signedOut)).json()) as { series: Edition['series']; volumes: Edition[] };
    expect(body.series).toEqual(linked);
    expect(body.volumes.map((v) => [v.isbn, v.volume])).toEqual([[asterixWhiteIris, 40]]);
    // A month later SUDOC still says "Aterix": it finds the linked Series.
    clock = new Date('2026-12-12T10:00:00.000Z');
    expect((await edition(await answerEdition(catalog, asterixWhiteIris))).series).toEqual(linked);
  });

  test('linking an identifier the Catalog does not know links nothing', async () => {
    const { catalog } = setup();
    const minted = (await edition(await answerEdition(catalog, spyFamily16))).series!.id;

    expect(catalog.link(minted, 'wd:Q1')).toBeUndefined();
    expect(catalog.series(minted)?.sameAs).toEqual([]);
  });

  test('an identifier the Catalog does not know resolves to nothing', () => {
    const { catalog } = setup();

    expect(catalog.series('wd:Q1')).toBeUndefined();
  });
});

describe('A Catalog file from before same_as (migration)', () => {
  // fixtures/catalog-v0.sqlite: made on 2026-11-11 by the Catalog of main
  // (a3f8d6c) from the recorded answers: One Piece 112, then 56, then the
  // Spy x Family Edition Line. One Piece got a minted identifier, and 56's
  // wd:Q673 was lost (CORE-42).
  const onePieceMinted = 'atomes:catalog.test:01M750SM80AX373XJ01DSVNDXC';
  const spyFamilyMinted = 'atomes:catalog.test:01M750SM804ES35F6C61WNPNEJ';
  const offline = () => recordedFetch(['catalogue.bnf.fr', 'www.sudoc.fr', 'inventaire.io', 'openlibrary.org']);

  function openV0(fetch: SourceFetch, now: Date) {
    const dir = mkdtempSync(join(tmpdir(), 'atomes-catalog-'));
    dirs.push(dir);
    const file = join(dir, 'catalog.sqlite');
    copyFileSync(new URL('catalog-v0.sqlite', fixtureDir), file);
    const catalog = createCatalog({ file, fetch, host: 'catalog.test', now: () => now });
    open.push(catalog);
    return catalog;
  }

  test('keeps the minted identifiers that reader records hold, and the Edition Lines', async () => {
    const sources = offline();
    const catalog = openV0(sources.fetch, new Date('2026-11-11T12:00:00.000Z'));

    expect(catalog.series(onePieceMinted)).toEqual({ id: onePieceMinted, title: 'One Piece', sameAs: [] });
    const onePiece = (await (await answerVolumes(catalog, onePiece112, signedOut)).json()) as { volumes: Edition[] };
    expect(onePiece.volumes.map((v) => [v.isbn, v.series?.id])).toEqual([
      [onePiece56, onePieceMinted],
      [onePiece112, onePieceMinted],
    ]);
    // The Spy x Family line was filled: it fills again once after the book
    // size step (CORE-58), and keeps its 16 Volumes while the sources are down.
    // The anchors are asked again for their Volumes (CORE-41), and kept offline.
    const spyFamily = (await (await answerVolumes(catalog, spyFamily16, signedIn)).json()) as { volumes: Edition[] };
    expect(spyFamily.volumes).toHaveLength(16);
    expect(new Set(spyFamily.volumes.map((v) => v.series?.id))).toEqual(new Set([spyFamilyMinted]));
    expect(sources.calls.filter((url) => !url.includes('isbn')).map((url) => new URL(url).host)).toEqual(['catalogue.bnf.fr']);
  });

  test('links the lost shared identifier when the Edition is fetched again', async () => {
    const catalog = openV0(recordedFetch().fetch, new Date('2026-12-12T12:00:00.000Z'));

    const found = await edition(await answerEdition(catalog, onePiece56));

    expect(found.series).toEqual({ id: 'wd:Q673', title: 'One Piece', sameAs: [onePieceMinted] });
    expect(catalog.series(onePieceMinted)).toEqual(found.series);
  });

  test('the Series title keys lose their spaces, and each Series is still found by its title (CORE-70)', async () => {
    const catalog = openV0(recordedFetch().fetch, new Date('2026-12-12T12:00:00.000Z'));
    const file = join(dirs.at(-1)!, 'catalog.sqlite');
    const db = new DatabaseSync(file, { readOnly: true });
    const keys = (db.prepare('select title_key from series_title order by title_key').all() as { title_key: string }[]).map((row) => row.title_key);
    db.close();

    expect(keys).toEqual(['onepiece', 'spyxfamily']);
    // One Piece 1 names no Series identifier this file knows: it joins by title.
    const series = (await edition(await answerEdition(catalog, onePiece1))).series;
    expect([series?.id, ...(series?.sameAs ?? [])]).toContain(onePieceMinted);
  });

  test('a migrated file opens again with no change', async () => {
    const catalog = openV0(offline().fetch, new Date('2026-11-11T12:00:00.000Z'));
    catalog.close();
    open.splice(open.indexOf(catalog), 1);
    const file = join(dirs.at(-1)!, 'catalog.sqlite');

    const again = createCatalog({ file, fetch: offline().fetch, host: 'catalog.test', now: () => new Date('2026-11-11T12:00:00.000Z') });
    open.push(again);

    expect(again.series(onePieceMinted)?.id).toBe(onePieceMinted);
    expect((await edition(await answerEdition(again, onePiece112))).series?.id).toBe(onePieceMinted);
  });
});
