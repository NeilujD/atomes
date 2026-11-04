// Test fake: the LocalCopy contract in memory. Values are cloned on the way in
// and out, as IndexedDB does.
import type { LocalCopy } from './local-copy';
import type { SpaceRecord } from './space';

export function memoryLocalCopy(): LocalCopy {
  const entries = new Map<string, SpaceRecord[]>();
  return {
    read: (key) => Promise.resolve(structuredClone(entries.get(key))),
    write: (key, records) => {
      entries.set(key, structuredClone(records));
      return Promise.resolve();
    },
    clear: () => {
      entries.clear();
      return Promise.resolve();
    },
  };
}
