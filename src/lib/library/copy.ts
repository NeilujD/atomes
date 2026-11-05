// `app.atomes.copy`: a physical book the reader owns (ADR 0010). Never Shared.
import { newRecordKey, type Space, type WriteState } from '../space/space';
import { isIsbn13, isWorkId } from './ids';
import { listRecords, putRecord } from './records';

export const copyCollection = 'app.atomes.copy';

// Typed by the reader when the Catalog does not know the ISBN.
export interface BookDetails {
  title: string;
  authors?: string[];
  series?: string;
  volume?: string;
}

export interface Copy {
  isbn: string;
  // Works this Copy contains; several for an omnibus.
  works: string[];
  lentTo?: string;
  acquiredAt?: string;
  details?: BookDetails;
  createdAt: string;
}

// A new Copy gets a new key; pass the key of an existing Copy to change it.
export async function saveCopy(space: Space, copy: Copy, rkey = newRecordKey()): Promise<{ rkey: string; state: WriteState }> {
  if (!isIsbn13(copy.isbn)) throw new Error(`Not an ISBN-13: ${copy.isbn}`);
  const badWork = copy.works.find((work) => !isWorkId(work));
  if (badWork !== undefined) throw new Error(`Not a Work identifier: ${badWork}`);
  const state = await putRecord(space, copyCollection, rkey, copy);
  return { rkey, state };
}

export function deleteCopy(space: Space, rkey: string): Promise<WriteState> {
  return space.delete(copyCollection, rkey);
}

export function listCopies(space: Space) {
  return listRecords<Copy>(space, copyCollection);
}
