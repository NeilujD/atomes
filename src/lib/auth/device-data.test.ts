import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { deviceCatalog } from '../catalog/device';
import { memoryLocalCopy } from '../space/local-copy.fake';
import { catalogCacheName, deviceData, oauthCacheName } from './device-data';

const copyKey = 'atomes-instance:did:plc:reader/app.atomes.copy';

// The CacheStorage calls deviceData uses, in memory.
function memoryCaches(names: string[]) {
  const kept = new Set(names);
  return {
    kept,
    caches: { delete: (name: string) => Promise.resolve(kept.delete(name)) },
  };
}

describe('data this device keeps for the reader', () => {
  test('clearing it removes the local copy of the Library, the Catalog answers looked up and the old PDS metadata', async () => {
    const localCopy = memoryLocalCopy();
    await localCopy.write(copyKey, [{ rkey: 'a', value: { isbn: '9782723478991' } }]);
    const { kept, caches } = memoryCaches([catalogCacheName, 'atomes-shell-abc', oauthCacheName]);

    await deviceData(localCopy, caches).clear();

    expect(await localCopy.read(copyKey)).toBeUndefined();
    expect([...kept]).toEqual(['atomes-shell-abc']);
  });

  test('with no Cache Storage (not a secure origin), the local copy is still cleared', async () => {
    const localCopy = memoryLocalCopy();
    await localCopy.write(copyKey, [{ rkey: 'a', value: {} }]);

    await deviceData(localCopy, undefined).clear();

    expect(await localCopy.read(copyKey)).toBeUndefined();
  });

  test('the service worker uses the same cache names', () => {
    const worker = readFileSync(new URL('../../../public/sw.js', import.meta.url), 'utf8');

    expect(worker).toContain(`const CATALOG_CACHE = '${catalogCacheName}';`);
    // The OAuth cache of older versions is only cleared now.
    expect(worker).not.toContain(oauthCacheName);
  });

  test('clearing it stops a keep of Shelf Check data still running on the page: the Catalog cache does not come back', async () => {
    const puts: string[] = [];
    const caches = {
      delete: () => Promise.resolve(true),
      open: () => Promise.resolve({ match: () => Promise.resolve(undefined), put: (path: string) => (puts.push(path), Promise.resolve()) }),
    };
    let answer: (response: Response) => void = () => undefined;
    const keeping = deviceCatalog({ caches, signedIn: () => true, fetch: () => new Promise((resolve) => (answer = resolve)) }).keep(['9782723478991'], []);
    await new Promise((resolve) => setTimeout(resolve, 0));

    await deviceData(memoryLocalCopy(), caches).clear();
    answer(Response.json({ isbn: '9782723478991' }));

    expect(await keeping).toBe(false);
    expect(puts).toEqual([]);
  });
});
