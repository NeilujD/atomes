// What this device keeps from the reader's use of Atomes. Sign-out clears all
// of it, so the next person on the device sees nothing of this Library:
// - the local copy of the Library (records and waiting writes);
// - the Catalog answers and covers the service worker kept: the books looked up;
// - the OAuth metadata that older versions of the service worker kept: it names
//   the reader's PDS.
// The app shell stays: its pages are kept by path, with no query (public/sw.js).
import type { LocalCopy } from '../space/local-copy';

// CATALOG_CACHE in public/sw.js, and the OAuth cache of older versions.
export const catalogCacheName = 'atomes-catalog';
export const oauthCacheName = 'atomes-oauth';

// `caches` is undefined outside a secure origin. Every part is cleared even
// when another fails; then it rejects, so sign-out can say so.
export function deviceData(
  localCopy: Pick<LocalCopy, 'clear'>,
  cacheStorage: Pick<CacheStorage, 'delete'> | undefined = globalThis.caches,
): { clear(): Promise<void> } {
  return {
    async clear() {
      const results = await Promise.allSettled([
        localCopy.clear(),
        cacheStorage?.delete(catalogCacheName),
        cacheStorage?.delete(oauthCacheName),
      ]);
      const failed = results.find((result) => result.status === 'rejected');
      if (failed) throw failed.reason;
    },
  };
}
