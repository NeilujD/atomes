// The records the app last read from the reader's private Space, and the
// writes not sent to the PDS yet, kept on this device so they still show and
// still go out with no network (ADR 0002). Only space.ts reads and writes it;
// signing out clears it, unsent writes too. Never sent to the Atomes server.
import type { PendingWrite, SpaceRecord } from './space';

export interface LocalCopy {
  // Undefined when nothing was kept for this key.
  read(key: string): Promise<SpaceRecord[] | undefined>;
  write(key: string, records: SpaceRecord[]): Promise<void>;
  // The writes not sent yet, oldest first. Empty when there are none.
  readQueue(key: string): Promise<PendingWrite[]>;
  writeQueue(key: string, writes: PendingWrite[]): Promise<void>;
  clear(): Promise<void>;
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
    clear: async () => {
      await run('readwrite', (store) => store.clear());
    },
  };
}
