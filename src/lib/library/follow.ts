// `app.atomes.follow`: a Followed or Dropped Series, in one Edition Line (ADR 0010).
// The record key is the Series identifier: one record per Series. The Catalog
// derives the Edition Line from the anchor Edition.
import type { Space } from '../space/space';
import { isIsbn13, isSeriesId } from './ids';
import { listRecords, putRecord } from './records';

export const followCollection = 'app.atomes.follow';

export const followStatuses = ['following', 'dropped'] as const;

export interface Follow {
  series: string;
  // An Edition in the Edition Line the reader collects.
  anchorIsbn: string;
  // Set when the reader switched Edition Line from this Volume onward.
  fromVolume?: string;
  status: (typeof followStatuses)[number];
  updatedAt: string;
}

export async function saveFollow(space: Space, follow: Follow): Promise<void> {
  if (!isSeriesId(follow.series)) throw new Error(`Not a Series identifier: ${follow.series}`);
  if (!isIsbn13(follow.anchorIsbn)) throw new Error(`Not an ISBN-13: ${follow.anchorIsbn}`);
  // The lexicon leaves `status` open (knownValues) so it can grow; this app writes only these.
  if (!followStatuses.includes(follow.status)) throw new Error(`Not a follow status: ${follow.status}`);
  await putRecord(space, followCollection, follow.series, follow);
}

export function listFollows(space: Space) {
  return listRecords<Follow>(space, followCollection);
}
