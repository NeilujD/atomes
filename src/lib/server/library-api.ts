// The instance API for Private records (ADR 0012), always for the DID of the
// browser session. The device store (src/lib/space/instance-store.ts) calls it:
//   GET    /api/library?since=<rev>           Changes (library-store.ts): every collection
//   GET    /api/library/<collection>          { records: [{ rkey, value }] }
//   GET    /api/library/<collection>/<rkey>   { rkey, value } or 404 RecordNotFound
//   PUT    /api/library/<collection>/<rkey>   body: the record. { rev }
//   DELETE /api/library/<collection>/<rkey>   { rev } ({} when there was nothing to delete)
// A put or a delete may add `?rev=<rev>`, the rev of the record it was based on:
// 409 StaleRecord when the record changed since (ADR 0012).
// Errors: { error, message }, as XRPC answers. No message holds a record value.
import { lexicons } from '../library/records';
import { StaleRecordError, type LibraryStore } from './library-store';
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
  {
    did,
    store,
    rules,
    onWrite,
  }: {
    did: string;
    store: LibraryStore;
    rules: RecordRules;
    // A put or a delete was stored (sharing mirrors it to the PDS, sharing.ts).
    onWrite?: (collection: string, rkey: string) => void;
  },
): Promise<Response> {
  const { pathname, searchParams } = new URL(request.url);
  let parts: string[];
  try {
    parts = pathname.slice(libraryPath.length).split('/').map(decodeURIComponent);
  } catch {
    return fail(400, 'InvalidRequest', 'Invalid path');
  }
  const [collection, rkey, ...rest] = parts;
  const since = revParam(searchParams.get('since'));
  const base = revParam(searchParams.get('rev'));
  if (since === null || base === null) return fail(400, 'InvalidRequest', 'A rev is a whole number');

  if (!collection && rest.length === 0 && since !== undefined) {
    if (request.method !== 'GET') return fail(405, 'MethodNotAllowed', 'Use GET');
    return reply(200, store.changesSince(did, since));
  }
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
      } catch (error) {
        // The device checks the same lexicons before it sends, so this is rare.
        // The lexicon's reason names the field and the rule, never the value.
        const reason = error instanceof Error ? `: ${error.message}` : '';
        return fail(400, 'InvalidRecord', `The record does not match the ${collection} lexicon${reason}`);
      }
      return unlessStale(() => ({ rev: store.put(did, collection, rkey, record, base) }), () => onWrite?.(collection, rkey));
    }
    case 'DELETE':
      return unlessStale(() => ({ rev: store.delete(did, collection, rkey, base) }), () => onWrite?.(collection, rkey));
    default:
      return fail(405, 'MethodNotAllowed', 'Use GET, PUT or DELETE');
  }
}

// Undefined when absent; null when it is not a rev.
function revParam(value: string | null): number | undefined | null {
  if (value === null) return undefined;
  return /^\d{1,15}$/.test(value) ? Number(value) : null;
}

// Another device changed the record since this write was made: the device
// takes the server's record (ADR 0012).
function unlessStale(write: () => { rev: number | undefined }, written: () => void): Response {
  try {
    const answer = write();
    written();
    return reply(200, answer);
  } catch (error) {
    if (error instanceof StaleRecordError) return fail(409, 'StaleRecord', error.message);
    throw error;
  }
}
