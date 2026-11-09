// Test fake: the LocalCopy contract in memory. Values are cloned on the way in
// and out, as IndexedDB does.
import type { LocalCopy } from './local-copy';
import type { PendingWrite, SpaceRecord, SyncState } from './queued-store';

export function memoryLocalCopy(): LocalCopy {
  const entries = new Map<string, SpaceRecord[] | PendingWrite[] | SyncState>();
  return {
    read: (key) => Promise.resolve(structuredClone(entries.get(key) as SpaceRecord[] | undefined)),
    write: (key, records) => {
      entries.set(key, structuredClone(records));
      return Promise.resolve();
    },
    readQueue: (key) => Promise.resolve(structuredClone((entries.get(key) as PendingWrite[] | undefined) ?? [])),
    writeQueue: (key, writes) => {
      entries.set(key, structuredClone(writes));
      return Promise.resolve();
    },
    readSync: (key) => Promise.resolve(structuredClone(entries.get(key) as SyncState | undefined)),
    writeSync: (key, state) => {
      entries.set(key, structuredClone(state));
      return Promise.resolve();
    },
    clear: () => {
      entries.clear();
      return Promise.resolve();
    },
  };
}
