// The instance API for Private records (ADR 0012), always for the DID of the
// browser session. The device store (src/lib/space/instance-store.ts) calls it:
//   GET    /api/library/<collection>          { records: [{ rkey, value }] }
//   GET    /api/library/<collection>/<rkey>   { rkey, value } or 404 RecordNotFound
//   PUT    /api/library/<collection>/<rkey>   body: the record. { rev }
//   DELETE /api/library/<collection>/<rkey>   {}
// Errors: { error, message }, as XRPC answers. No message holds a record value.
import { lexicons } from '../library/records';
import type { LibraryStore } from './library-store';
import { isValidRecordKey } from './record-key';

export const libraryPath = '/api/library/';

// What the server accepts. Device tests of the queue use looser rules.
export interface RecordRules {
  isCollection(collection: string): boolean;
  // Throws when the record does not match its lexicon.
  assertValid(collection: string, record: unknown): void;
}

// Library record types only, each valid against its lexicon: the same check
// the device runs before it sends (ADR 0012).
export const lexiconRules: RecordRules = {
  isCollection: (collection) => lexicons.getDef(collection)?.type === 'record',
  assertValid: (collection, record) => {
    lexicons.assertValidRecord(collection, record);
  },
};

const reply = (status: number, body: unknown) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const fail = (status: number, error: string, message: string) => reply(status, { error, message });

export async function handleLibraryRequest(
  request: Request,
  { did, store, rules }: { did: string; store: LibraryStore; rules: RecordRules },
): Promise<Response> {
  const { pathname } = new URL(request.url);
  let parts: string[];
  try {
    parts = pathname.slice(libraryPath.length).split('/').map(decodeURIComponent);
  } catch {
    return fail(400, 'InvalidRequest', 'Invalid path');
  }
  const [collection, rkey, ...rest] = parts;
  if (!collection || !rules.isCollection(collection)) return fail(400, 'InvalidCollection', 'Unknown record collection');
  if (rest.length > 0 || (rkey !== undefined && !isValidRecordKey(rkey))) return fail(400, 'InvalidRecordKey', 'Invalid record key');

  if (rkey === undefined) {
    if (request.method !== 'GET') return fail(405, 'MethodNotAllowed', 'Use GET');
    return reply(200, { records: store.list(did, collection) });
  }

  switch (request.method) {
    case 'GET': {
      const value = store.get(did, collection, rkey);
      return value === undefined ? fail(404, 'RecordNotFound', 'Record not found') : reply(200, { rkey, value });
    }
    case 'PUT': {
      const record = (await request.json().catch(() => undefined)) as unknown;
      if (typeof record !== 'object' || record === null || (record as { $type?: unknown }).$type !== collection) {
        return fail(400, 'InvalidRecord', `The record must be an object with $type ${collection}`);
      }
      try {
        rules.assertValid(collection, record);
      } catch {
        // The device checks the same lexicons before it sends, so this is rare.
        return fail(400, 'InvalidRecord', `The record does not match the ${collection} lexicon`);
      }
      return reply(200, { rev: store.put(did, collection, rkey, record) });
    }
    case 'DELETE':
      store.delete(did, collection, rkey);
      return reply(200, {});
    default:
      return fail(405, 'MethodNotAllowed', 'Use GET, PUT or DELETE');
  }
}
