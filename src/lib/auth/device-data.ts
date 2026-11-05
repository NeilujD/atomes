// What this device keeps from the reader's use of Atomes. Sign-out clears all
// of it, so the next person on the device sees nothing of this Library:
// - the local copy of the Space (records and waiting writes);
// - the Catalog answers the service worker kept: the books looked up.
// The app shell and the OAuth metadata stay: they hold nothing about the reader.
import type { LocalCopy } from '../space/local-copy';

// CATALOG_CACHE in public/sw.js.
export const catalogCacheName = 'atomes-catalog';

// `caches` is undefined outside a secure origin.
export function deviceData(
  localCopy: Pick<LocalCopy, 'clear'>,
  cacheStorage: Pick<CacheStorage, 'delete'> | undefined = globalThis.caches,
): { clear(): Promise<void> } {
  return {
    async clear() {
      await Promise.all([localCopy.clear(), cacheStorage?.delete(catalogCacheName)]);
    },
  };
}
