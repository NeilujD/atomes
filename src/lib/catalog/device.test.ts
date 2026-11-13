import { describe, expect, test } from 'vitest';
import { catalogCacheName } from '../auth/device-data';
import type { Edition } from './catalog';
import { deviceCatalog } from './device';

const onePiece56 = '9782723478991';
const onePiece112 = '9782344068922';
const unknown = '9791099999993';

const edition = (isbn: string, volume: number): Edition => ({
  isbn,
  title: 'One Piece',
  volumeTitle: null,
  authors: ['Eiichiro Oda'],
  publisher: 'Glénat',
  language: 'fre',
  format: null,
  cover: null,
  work: { id: `wd:Q${volume}`, title: `One Piece ${volume}` },
  series: { id: 'wd:Q673', title: 'One Piece', sameAs: [] },
  volumes: [volume],
  volume,
  sources: ['BnF'],
  fetchedAt: '2026-11-13T10:00:00.000Z',
});

// The Cache Storage calls the device Catalog uses, in memory.
function memoryCaches() {
  const caches = new Map<string, Map<string, Response>>();
  return {
    caches,
    storage: {
      open: (name: string) => {
        const cache = caches.get(name) ?? new Map<string, Response>();
        caches.set(name, cache);
        return Promise.resolve({
          match: (path: string) => Promise.resolve(cache.get(path)?.clone()),
          put: (path: string, response: Response) => {
            cache.set(path, response);
            return Promise.resolve();
          },
        });
      },
    },
  };
}

// The Atomes server: the Catalog answers of these paths; any other path is 404.
function server(answers: Record<string, unknown>) {
  const asked: { path: string; init: unknown }[] = [];
  return {
    asked,
    fetch: (path: string, init?: unknown) => {
      asked.push({ path, init });
      return Promise.resolve(path in answers ? Response.json(answers[path]) : new Response('{}', { status: 404 }));
    },
  };
}

const offline = () => Promise.reject(new TypeError('Failed to fetch'));

describe('the Catalog data this device keeps', () => {
  test('keeps the Editions and the Edition Lines it is given, and reads them with no network', async () => {
    const { caches, storage } = memoryCaches();
    const online = server({
      [`/api/catalog/editions/${onePiece56}`]: edition(onePiece56, 56),
      [`/api/catalog/editions/${onePiece56}/volumes`]: { series: null, volumes: [edition(onePiece56, 56), edition(onePiece112, 112)] },
    });
    await deviceCatalog({ caches: storage, fetch: online.fetch }).keep([onePiece56], [onePiece56]);

    const device = deviceCatalog({ caches: storage, fetch: offline });

    expect((await device.edition(onePiece56))?.work.id).toBe('wd:Q56');
    expect((await device.line(onePiece56))?.map(({ volume }) => volume)).toEqual([56, 112]);
    expect([...caches.keys()]).toEqual([catalogCacheName]);
  });

  test('nothing kept: no Edition and no Edition Line, never a guess', async () => {
    const device = deviceCatalog({ caches: memoryCaches().storage, fetch: offline });

    expect(await device.edition(unknown)).toBeUndefined();
    expect(await device.line(unknown)).toBeUndefined();
  });

  test('asks the Atomes server only for ISBNs, with a plain GET: no Library record goes with them', async () => {
    const online = server({ [`/api/catalog/editions/${onePiece56}`]: edition(onePiece56, 56) });

    await deviceCatalog({ caches: memoryCaches().storage, fetch: online.fetch }).keep([onePiece56, unknown], [onePiece56]);

    expect(online.asked.sort((a, b) => a.path.localeCompare(b.path))).toEqual([
      { path: `/api/catalog/editions/${onePiece56}`, init: undefined },
      { path: `/api/catalog/editions/${onePiece56}/volumes`, init: undefined },
      { path: `/api/catalog/editions/${unknown}`, init: undefined },
    ]);
  });

  test('an Edition already kept is not asked again; an Edition Line is, as it grows', async () => {
    const { storage } = memoryCaches();
    const answers = {
      [`/api/catalog/editions/${onePiece56}`]: edition(onePiece56, 56),
      [`/api/catalog/editions/${onePiece56}/volumes`]: { series: null, volumes: [edition(onePiece56, 56)] },
    };
    await deviceCatalog({ caches: storage, fetch: server(answers).fetch }).keep([onePiece56], [onePiece56]);
    const again = server(answers);

    await deviceCatalog({ caches: storage, fetch: again.fetch }).keep([onePiece56], [onePiece56]);

    expect(again.asked.map(({ path }) => path)).toEqual([`/api/catalog/editions/${onePiece56}/volumes`]);
  });

  test('says whether everything was asked: false when the network failed, and keeps what it has', async () => {
    const { storage } = memoryCaches();
    const first = deviceCatalog({ caches: storage, fetch: server({ [`/api/catalog/editions/${onePiece56}`]: edition(onePiece56, 56) }).fetch });
    expect(await first.keep([onePiece56, unknown], [])).toBe(true);

    const device = deviceCatalog({ caches: storage, fetch: offline });

    expect(await device.keep([onePiece112], [onePiece56])).toBe(false);
    expect((await device.edition(onePiece56))?.volume).toBe(56);
  });

  test('an answer kept by an older service worker, with no `volumes`, has its one Volume', async () => {
    const { storage } = memoryCaches();
    const old: Partial<Edition> = edition(onePiece56, 56);
    delete old.volumes;
    await (await storage.open(catalogCacheName)).put(`/api/catalog/editions/${onePiece56}`, Response.json(old));

    expect((await deviceCatalog({ caches: storage, fetch: offline }).edition(onePiece56))?.volumes).toEqual([56]);
  });

  test('knows the covers this device has seen, to show none it would have to ask for', async () => {
    const { storage } = memoryCaches();
    await (await storage.open(catalogCacheName)).put(`/api/catalog/editions/${onePiece56}/cover`, new Response('jpeg'));
    const device = deviceCatalog({ caches: storage, fetch: offline });

    expect(await device.hasCover(onePiece56)).toBe(true);
    expect(await device.hasCover(onePiece112)).toBe(false);
  });

  test('with no Cache Storage (not a secure origin), it keeps nothing and knows nothing', async () => {
    const online = server({});
    const device = deviceCatalog({ caches: undefined, fetch: online.fetch });

    expect(await device.keep([onePiece56], [onePiece56])).toBe(false);
    expect(await device.edition(onePiece56)).toBeUndefined();
    expect(await device.hasCover(onePiece56)).toBe(false);
    expect(online.asked).toEqual([]);
  });
});
