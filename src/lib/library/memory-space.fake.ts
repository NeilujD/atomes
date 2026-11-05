import type { Space, WriteState } from '../space/space';

// A Space that keeps records in memory, per collection and key. Every write is
// saved at once and reports `state`. The Space contract itself is tested in
// src/lib/space/space.test.ts.
export function memorySpace(state: WriteState = 'sent') {
  const stored = new Map<string, Map<string, unknown>>();
  const of = (collection: string) => stored.get(collection) ?? stored.set(collection, new Map()).get(collection)!;
  const space: Space = {
    ensure: () => Promise.resolve(),
    put: (collection, rkey, value) => {
      of(collection).set(rkey, value);
      return Promise.resolve(state);
    },
    delete: (collection, rkey) => {
      of(collection).delete(rkey);
      return Promise.resolve(state);
    },
    get: (collection, rkey) => Promise.resolve(of(collection).get(rkey)),
    list: (collection) =>
      Promise.resolve({ records: [...of(collection)].map(([rkey, value]) => ({ rkey, value })), stale: false }),
    sendWaiting: () => Promise.resolve(),
    pending: () => Promise.resolve([]),
  };
  return { space, stored: (collection: string) => [...of(collection)].map(([rkey, value]) => ({ rkey, value })) };
}
