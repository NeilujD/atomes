// What the store contract tests need from a fake server behind a store.
import type { FetchHandler } from './space';

export interface FakeStoreServer {
  handler: FetchHandler;
  // The writes the server applied, in order: "put <rkey>" or "delete <rkey>".
  writes: string[];
  // `online = false` stands for the network off: fetch() rejects with a TypeError.
  // `failing`: the server is reached but cannot do the work now (HTTP 5xx, or 429).
  network: { online: boolean; failing?: number };
}
