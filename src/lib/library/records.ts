// Writes and reads Library records, checked against the lexicons in
// `lexicons/` (ADR 0010). The instance runs the same check on every write
// (src/lib/server/library-api.ts, ADR 0012).
import { Lexicons, parseLexiconDoc } from '@atproto/lexicon';
import type { Space, WriteState } from '../space/space';

const files = import.meta.glob<unknown>('../../../lexicons/app/atomes/*.json', { eager: true, import: 'default' });
export const lexicons = new Lexicons(Object.values(files).map((file) => parseLexiconDoc(file)));

export interface Saved<T> {
  rkey: string;
  value: T;
}

// Throws, and writes nothing, when the record does not match its lexicon.
export async function putRecord(space: Space, collection: string, rkey: string, value: object): Promise<WriteState> {
  const record = { $type: collection, ...value };
  lexicons.assertValidRecord(collection, record);
  return space.put(collection, rkey, record);
}

// stale: the PDS could not be reached; the records are the copy on this device.
// Records that do not match the lexicon (another app, an older shape) are skipped.
export async function listRecords<T>(space: Space, collection: string): Promise<{ records: Saved<T>[]; stale: boolean }> {
  const { records, stale } = await space.list(collection);
  return {
    records: records.filter(({ value }) => isValid(collection, value)).map(({ rkey, value }) => ({ rkey, value: value as T })),
    stale,
  };
}

function isValid(collection: string, value: unknown): boolean {
  try {
    lexicons.assertValidRecord(collection, value);
    return true;
  } catch {
    return false;
  }
}
