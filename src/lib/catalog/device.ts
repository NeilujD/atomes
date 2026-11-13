// The Catalog data this device keeps, so that Shelf Check answers with no
// network (CORE-37, ADR 0002): the Editions of the Library and the Edition
// Lines of the Followed Series. They are the Catalog's own answers, kept under
// their paths in the cache of the service worker (public/sw.js), which also
// keeps every answer and cover the pages saw. Book data only, never Library
// data; sign-out deletes it (src/lib/auth/device-data.ts).
import { accountKey } from '../auth/gate-boot';
import type { Edition } from './catalog';
import { coverPath, editionPath, volumesPath, withVolumes, type Answered } from './client';

// CATALOG_CACHE in public/sw.js (the worker cannot import it; device-data.test.ts checks they match).
export const catalogCacheName = 'atomes-catalog';

// Aborted when sign-out clears this device (src/lib/auth/device-data.ts): a
// keep still running on the page then writes nothing more, so the cache it
// deleted does not come back with the reader's books.
const signOut = new AbortController();
export function stopKeeping(): void {
  signOut.abort();
}

// The account the device saw last; gone once the reader signed out, in any tab.
function savedAccount(): boolean {
  try {
    return globalThis.localStorage?.getItem(accountKey) != null;
  } catch {
    return false;
  }
}

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
  // Asks the Atomes server for the Editions of `isbns` and the Edition Lines
  // of `anchors` not kept yet; with `refreshLines`, for every Edition Line
  // again (a line grows as Volumes come out). An Edition is never asked again.
  // Only the ISBN goes, in a plain GET. True when every one was answered, a
  // 404 included; false when the network failed, the device cannot keep, or
  // the reader signed out meanwhile.
  keep(isbns: string[], anchors: string[], options?: { refreshLines?: boolean }): Promise<boolean>;
}

type CacheCalls = Pick<Cache, 'match' | 'put'>;

export function deviceCatalog({
  caches = globalThis.caches,
  fetch = (path) => globalThis.fetch(path),
  stop = signOut.signal,
  signedIn = savedAccount,
}: {
  // Undefined outside a secure origin.
  caches?: { open(name: string): Promise<CacheCalls> };
  fetch?: (path: string) => Promise<Response>;
  stop?: AbortSignal;
  signedIn?: () => boolean;
}): KeptCatalog {
  const open = () => caches?.open(catalogCacheName);
  const stopped = () => stop.aborted || !signedIn();

  // An entry that cannot be read (cut short, another shape) counts as not kept.
  async function read(path: string): Promise<unknown> {
    try {
      const response = await (await open())?.match(path);
      return response?.ok ? await response.json() : undefined;
    } catch {
      return undefined;
    }
  }

  async function ask(cache: CacheCalls, path: string): Promise<boolean> {
    try {
      const response = await fetch(path);
      if (stopped()) return false;
      if (response.ok) await cache.put(path, response);
      return response.ok || response.status === 404;
    } catch {
      return false;
    }
  }

  return {
    async edition(isbn) {
      const answer = (await read(editionPath(isbn))) as Answered | undefined;
      return answer && typeof answer === 'object' && typeof answer.isbn === 'string' ? withVolumes(answer) : undefined;
    },
    async line(anchor) {
      const answer = (await read(volumesPath(anchor))) as { volumes?: unknown } | undefined;
      return Array.isArray(answer?.volumes) ? (answer.volumes as Answered[]).map(withVolumes) : undefined;
    },
    async hasCover(isbn) {
      return Boolean(await (await open())?.match(coverPath(isbn)).catch(() => undefined));
    },
    async keep(isbns, anchors, { refreshLines = false } = {}) {
      const cache = await open();
      if (!cache || stopped()) return false;
      const notKept = async (path: string) => ((await cache.match(path)) ? [] : [path]);
      const editions = await Promise.all([...new Set(isbns)].map((isbn) => notKept(editionPath(isbn))));
      const lines = [...new Set(anchors.map(volumesPath))];
      const paths = [...editions.flat(), ...(refreshLines ? lines : (await Promise.all(lines.map(notKept))).flat())];
      return (await Promise.all(paths.map((path) => ask(cache, path)))).every(Boolean);
    },
  };
}
