import type { Space } from '../space/space';

// A Space that keeps records in memory, per collection and key. The Space
// contract itself is tested in src/lib/space/space.test.ts.
export function memorySpace() {
  const stored = new Map<string, Map<string, unknown>>();
  const of = (collection: string) => stored.get(collection) ?? stored.set(collection, new Map()).get(collection)!;
  const space: Space = {
    ensure: () => Promise.resolve(),
    put: (collection, rkey, value) => {
      of(collection).set(rkey, value);
      return Promise.resolve();
    },
    get: (collection, rkey) => Promise.resolve(of(collection).get(rkey)),
    list: (collection) =>
      Promise.resolve({ records: [...of(collection)].map(([rkey, value]) => ({ rkey, value })), stale: false }),
  };
  return { space, stored: (collection: string) => [...of(collection)].map(([rkey, value]) => ({ rkey, value })) };
}
