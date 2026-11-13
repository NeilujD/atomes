// The sharing API (CORE-38), always for the DID of the browser session:
//   GET  /api/sharing                          SharingState
//   PUT  /api/sharing/categories/<category>    body { shared: boolean }. SharingState
//   PUT  /api/sharing/private-works/<work>     body { private: boolean }. SharingState
//   POST /api/sharing/sync                     tries the PDS again. SharingState
// Errors: { error, message }. 403 NeedsConsent: the reader signs in again to
// share. 503 PdsUnreachable: nothing was saved.
import { isWorkId } from '../library/ids';
import { isCategory } from '../sharing/categories';
import { NeedsConsentError, type Sharing } from './sharing';

export const sharingPath = '/api/sharing';

const reply = (status: number, body: unknown) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const fail = (status: number, error: string, message: string) => reply(status, { error, message });

async function flag(request: Request, name: string): Promise<boolean | undefined> {
  const body = (await request.json().catch(() => undefined)) as Record<string, unknown> | undefined;
  const value = body?.[name];
  return typeof value === 'boolean' ? value : undefined;
}

export async function handleSharingRequest(request: Request, { did, sharing }: { did: string; sharing: Sharing }): Promise<Response> {
  let parts: string[];
  try {
    parts = new URL(request.url).pathname.slice(sharingPath.length).split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return fail(400, 'InvalidRequest', 'Invalid path');
  }
  const [kind, name, ...rest] = parts;
  const method = request.method;

  if (kind === undefined) {
    return method === 'GET' ? reply(200, await sharing.state(did)) : fail(405, 'MethodNotAllowed', 'Use GET');
  }
  if (kind === 'sync' && name === undefined) {
    return method === 'POST' ? reply(200, await sharing.sync(did)) : fail(405, 'MethodNotAllowed', 'Use POST');
  }
  if ((kind !== 'categories' && kind !== 'private-works') || name === undefined || rest.length > 0) {
    return fail(404, 'NotFound', 'Unknown sharing path');
  }
  if (method !== 'PUT') return fail(405, 'MethodNotAllowed', 'Use PUT');

  if (kind === 'private-works') {
    if (!isWorkId(name)) return fail(400, 'InvalidWork', 'A Work is a Catalog identifier');
    const kept = await flag(request, 'private');
    if (kept === undefined) return fail(400, 'InvalidRequest', 'The body is { private: boolean }');
    return reply(200, await sharing.setPrivate(did, name, kept));
  }

  if (!isCategory(name)) return fail(400, 'InvalidCategory', 'Unknown sharing category');
  const shared = await flag(request, 'shared');
  if (shared === undefined) return fail(400, 'InvalidRequest', 'The body is { shared: boolean }');
  try {
    return reply(200, await sharing.setShared(did, name, shared));
  } catch (error) {
    if (error instanceof NeedsConsentError) return fail(403, 'NeedsConsent', error.message);
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
    console.warn(`Sharing start failed: ${reason}`);
    return fail(503, 'PdsUnreachable', 'The PDS could not be reached');
  }
}
