// The Catalog data this device keeps, so that Shelf Check answers with no
// network (CORE-37, ADR 0002): the Editions of the Library and the Edition
// Lines of the Followed Series. They are the Catalog's own answers, kept under
// their paths in the cache of the service worker (public/sw.js), which also
// keeps every answer and cover the pages saw. Book data only, never Library
// data; sign-out deletes it (src/lib/auth/device-data.ts).
import { catalogCacheName } from '../auth/device-data';
import type { Edition } from './catalog';
import { coverPath, editionPath, volumesPath, withVolumes, type Answered } from './client';

// What a Shelf Check reads of the device: never the network.
export interface DeviceCatalog {
  // Undefined when this device keeps no answer for the ISBN.
  edition(isbn: string): Promise<Edition | undefined>;
  // The Volumes of the Edition Line of `anchor` (`/volumes`); undefined when not kept.
  line(anchor: string): Promise<Edition[] | undefined>;
  // Whether this device keeps the cover of the ISBN (the service worker keeps
  // those the pages showed): offline, a cover it does not have is not asked for.
  hasCover(isbn: string): Promise<boolean>;
}

export interface KeptCatalog extends DeviceCatalog {
  // Asks the Atomes server for the Editions of `isbns` not kept yet, and for
  // every Edition Line of `anchors` again (a line grows as Volumes come out).
  // Only the ISBN goes, in a plain GET. True when every one was answered, a
  // 404 included; false when the network failed or the device cannot keep.
  keep(isbns: string[], anchors: string[]): Promise<boolean>;
}

type CacheCalls = Pick<Cache, 'match' | 'put'>;

export function deviceCatalog({
  caches = globalThis.caches,
  fetch = (path) => globalThis.fetch(path),
}: {
  // Undefined outside a secure origin.
  caches?: { open(name: string): Promise<CacheCalls> };
  fetch?: (path: string) => Promise<Response>;
}): KeptCatalog {
  const open = () => caches?.open(catalogCacheName);

  async function read(path: string): Promise<unknown> {
    const response = await (await open())?.match(path);
    return response?.ok ? response.json() : undefined;
  }

  async function ask(cache: CacheCalls, path: string): Promise<boolean> {
    try {
      const response = await fetch(path);
      if (response.ok) await cache.put(path, response);
      return response.ok || response.status === 404;
    } catch {
      return false;
    }
  }

  return {
    async edition(isbn) {
      const answer = (await read(editionPath(isbn))) as Answered | undefined;
      return answer && withVolumes(answer);
    },
    async line(anchor) {
      const answer = (await read(volumesPath(anchor))) as { volumes: Answered[] } | undefined;
      return answer?.volumes.map(withVolumes);
    },
    async hasCover(isbn) {
      return Boolean(await (await open())?.match(coverPath(isbn)));
    },
    async keep(isbns, anchors) {
      const cache = await open();
      if (!cache) return false;
      const missing = await Promise.all([...new Set(isbns)].map(async (isbn) => ((await cache.match(editionPath(isbn))) ? [] : [editionPath(isbn)])));
      const paths = [...missing.flat(), ...new Set(anchors.map(volumesPath))];
      return (await Promise.all(paths.map((path) => ask(cache, path)))).every(Boolean);
    },
  };
}
