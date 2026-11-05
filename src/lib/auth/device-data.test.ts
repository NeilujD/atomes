import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { memoryLocalCopy } from '../space/local-copy.fake';
import { catalogCacheName, deviceData, oauthCacheName } from './device-data';

const copyKey = 'at://did:plc:reader/space/app.atomes.library/self/app.atomes.copy';

// The CacheStorage calls deviceData uses, in memory.
function memoryCaches(names: string[]) {
  const kept = new Set(names);
  return {
    kept,
    caches: { delete: (name: string) => Promise.resolve(kept.delete(name)) },
  };
}

describe('data this device keeps for the reader', () => {
  test('clearing it removes the local copy of the Space, the Catalog answers looked up and the PDS metadata', async () => {
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
    expect(worker).toContain(`const OAUTH_CACHE = '${oauthCacheName}';`);
  });
});
