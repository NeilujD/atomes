import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { isSeriesId } from '../library/ids';
import { answerChoose, answerCover, answerEdition, answerSearch, answerVolumes } from './api';
import type { Catalog, Edition, SearchFound } from './catalog';
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
    old.exec('alter table edition drop column volumes; pragma user_version = 2');
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

    // BnF lists no Volume 24 to 26 of the 18 cm Glénat line.
    const numbers = Array.from({ length: 42 }, (_, i) => i + 1).filter((n) => n < 24 || n > 26);
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
    old.exec('pragma user_version = 3');
    old.close();
    return file;
  }

  test('splits a line by book size, from the first Edition looked up', async () => {
    const file = await mixedFile();
    const catalog = createCatalog({ file, fetch: recordedFetch().fetch, host: 'catalog.test' });
    open.push(catalog);

    expect((await volumesOf(catalog, dragonBall1, signedOut)).map((v) => v.isbn)).toEqual([dragonBall1]);
    expect(await volumesOf(catalog, dragonBallPerfect1, signedOut)).toHaveLength(32);
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
