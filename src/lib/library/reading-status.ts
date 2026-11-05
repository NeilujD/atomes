// `app.atomes.readingStatus`: where the reader stands with a Work (ADR 0004, ADR 0010).
// The record key is the Work identifier, so a Work has one Reading Status:
// saving again replaces it. No record means unread.
import type { Space, WriteState } from '../space/space';
import { isIsbn13, isWorkId } from './ids';
import { listRecords, putRecord } from './records';

export const readingStatusCollection = 'app.atomes.readingStatus';

export const statuses = ['unread', 'reading', 'read', 'abandoned'] as const;
export type Status = (typeof statuses)[number];

export interface ReadingStatus {
  work: string;
  // The Edition read or being read.
  isbn: string;
  status: Status;
  finishedAt?: string;
  updatedAt: string;
}

export async function saveReadingStatus(space: Space, readingStatus: ReadingStatus): Promise<WriteState> {
  if (!isWorkId(readingStatus.work)) throw new Error(`Not a Work identifier: ${readingStatus.work}`);
  if (!isIsbn13(readingStatus.isbn)) throw new Error(`Not an ISBN-13: ${readingStatus.isbn}`);
  // The lexicon leaves `status` open (knownValues) so it can grow; this app writes only these.
  if (!statuses.includes(readingStatus.status)) throw new Error(`Not a Reading Status: ${readingStatus.status}`);
  return putRecord(space, readingStatusCollection, readingStatus.work, readingStatus);
}

export function listReadingStatuses(space: Space) {
  return listRecords<ReadingStatus>(space, readingStatusCollection);
}
