// `app.atomes.copy`: a physical book the reader owns (ADR 0010). Never Shared.
import { newRecordKey, type Space } from '../space/space';
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
export async function saveCopy(space: Space, copy: Copy, rkey = newRecordKey()): Promise<string> {
  if (!isIsbn13(copy.isbn)) throw new Error(`Not an ISBN-13: ${copy.isbn}`);
  const badWork = copy.works.find((work) => !isWorkId(work));
  if (badWork !== undefined) throw new Error(`Not a Work identifier: ${badWork}`);
  await putRecord(space, copyCollection, rkey, copy);
  return rkey;
}

export function listCopies(space: Space) {
  return listRecords<Copy>(space, copyCollection);
}
