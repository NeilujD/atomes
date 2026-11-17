// The Library records the app last read from its store, the writes not sent
// yet and the last sync, kept on this device so they still show and still go
// out with no network (ADR 0002). Only queued-store.ts reads and writes it;
// signing out clears it, unsent writes too.
import type { PendingWrite, SpaceRecord, SyncState } from './queued-store';

export interface LocalCopy {
  // Undefined when nothing was kept for this key.
  read(key: string): Promise<SpaceRecord[] | undefined>;
  write(key: string, records: SpaceRecord[]): Promise<void>;
  // The writes not sent yet, oldest first. Empty when there are none.
  readQueue(key: string): Promise<PendingWrite[]>;
  writeQueue(key: string, writes: PendingWrite[]): Promise<void>;
  // The last sync with a store that has revs; undefined before the first one.
  readSync(key: string): Promise<SyncState | undefined>;
  writeSync(key: string, state: SyncState): Promise<void>;
  // Moves everything kept for the store `from` (its records, waiting writes
  // and sync state: the keys `<from>/…` and `<from>#…`) to the store `to`, at
  // once: no write is lost, and none is left to be sent twice.
  move(from: string, to: string): Promise<void>;
  clear(): Promise<void>;
}

// The key under `to` of a key kept for the store `from`; undefined for another store's key.
export function movedKey(key: string, from: string, to: string): string | undefined {
  return key.startsWith(`${from}/`) || key.startsWith(`${from}#`) ? to + key.slice(from.length) : undefined;
}

const databaseName = 'atomes-local-copy';
const storeName = 'records';

export function indexedDbLocalCopy(): LocalCopy {
  let opened: Promise<IDBDatabase> | undefined;

  function open() {
    opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(storeName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Could not open the local copy'));
    });
    return opened;
  }

  // Resolves when the transaction commits, so a cleared copy stays cleared.
  async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const database = await open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));
      const fail = () => reject(transaction.error ?? new Error('Local copy transaction failed'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = fail;
      transaction.onabort = fail;
    });
  }

  return {
    read: (key) => run('readonly', (store) => store.get(key) as IDBRequest<SpaceRecord[] | undefined>),
    write: async (key, records) => {
      await run('readwrite', (store) => store.put(records, key));
    },
    readQueue: async (key) =>
      (await run('readonly', (store) => store.get(key) as IDBRequest<PendingWrite[] | undefined>)) ?? [],
    writeQueue: async (key, writes) => {
      await run('readwrite', (store) => store.put(writes, key));
    },
    readSync: (key) => run('readonly', (store) => store.get(key) as IDBRequest<SyncState | undefined>),
    writeSync: async (key, state) => {
      await run('readwrite', (store) => store.put(state, key));
    },
    move: async (from, to) => {
      const database = await open();
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const cursor = store.openCursor();
        cursor.onsuccess = () => {
          const each = cursor.result;
          if (!each) return;
          // Every key of this store is a string.
          const key = movedKey(each.key as string, from, to);
          if (key !== undefined) {
            store.put(each.value, key);
            each.delete();
          }
          each.continue();
        };
        const fail = () => reject(transaction.error ?? new Error('Local copy move failed'));
        transaction.oncomplete = () => resolve();
        transaction.onerror = fail;
        transaction.onabort = fail;
      });
    },
    clear: async () => {
      await run('readwrite', (store) => store.clear());
    },
  };
}
