// `app.atomes.toBuy`: an Edition the reader added to To Buy by hand (ADR 0010).
// Missing and New Volumes are computed, never stored. The record key is the
// ISBN, so an Edition is on the list once. Never Shared.
import type { Space } from '../space/space';
import { isIsbn13 } from './ids';
import { listRecords, putRecord } from './records';

export const toBuyCollection = 'app.atomes.toBuy';

export interface ToBuy {
  isbn: string;
  createdAt: string;
}

export async function saveToBuy(space: Space, toBuy: ToBuy): Promise<void> {
  if (!isIsbn13(toBuy.isbn)) throw new Error(`Not an ISBN-13: ${toBuy.isbn}`);
  await putRecord(space, toBuyCollection, toBuy.isbn, toBuy);
}

export function listToBuy(space: Space) {
  return listRecords<ToBuy>(space, toBuyCollection);
}
