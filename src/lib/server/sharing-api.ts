// The sharing API (CORE-38), always for the Account of the browser session:
//   GET  /api/sharing                          SharingState
//   PUT  /api/sharing/categories/<category>    body { shared: boolean }. SharingState
//   PUT  /api/sharing/private-works/<work>     body { private: boolean }. SharingState
//   PUT  /api/sharing/private-works            body { works: string[], private: boolean }:
//        many Works at once (bulk select), 1 to 1000, each a Catalog identifier. SharingState
//   POST /api/sharing/sync                     tries the PDS again. SharingState
// Errors: { error, message }. 403 NeedsConsent: the reader signs in again to
// share. 503 PdsUnreachable: nothing was saved.
import { isWorkId } from '../library/ids';
import { isCategory } from '../sharing/categories';
import type { AccountId } from './accounts';
import { logFailure, NeedsConsentError, type Sharing } from './sharing';

export const sharingPath = '/api/sharing';

const reply = (status: number, body: unknown) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const fail = (status: number, error: string, message: string) => reply(status, { error, message });

const mostWorks = 1000;

const readBody = async (request: Request) => (await request.json().catch(() => undefined)) as Record<string, unknown> | undefined;
const booleanOf = (body: Record<string, unknown> | undefined, name: string) => (typeof body?.[name] === 'boolean' ? body[name] : undefined);

async function flag(request: Request, name: string): Promise<boolean | undefined> {
  return booleanOf(await readBody(request), name);
}

// `{ works, private }`: undefined unless every Work is a Catalog identifier.
async function privateWorks(request: Request): Promise<{ works: string[]; kept: boolean } | undefined> {
  const body = await readBody(request);
  const works = body?.works;
  const kept = booleanOf(body, 'private');
  if (kept === undefined || !Array.isArray(works) || works.length === 0 || works.length > mostWorks) return undefined;
  if (!works.every((work): work is string => typeof work === 'string' && isWorkId(work))) return undefined;
  return { works, kept };
}

export async function handleSharingRequest(request: Request, { account, sharing }: { account: AccountId; sharing: Sharing }): Promise<Response> {
  let parts: string[];
  try {
    parts = new URL(request.url).pathname.slice(sharingPath.length).split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return fail(400, 'InvalidRequest', 'Invalid path');
  }
  const [kind, name, ...rest] = parts;
  const method = request.method;

  if (kind === undefined) {
    return method === 'GET' ? reply(200, await sharing.state(account)) : fail(405, 'MethodNotAllowed', 'Use GET');
  }
  if (kind === 'sync' && name === undefined) {
    return method === 'POST' ? reply(200, await sharing.sync(account)) : fail(405, 'MethodNotAllowed', 'Use POST');
  }
  if (kind === 'private-works' && name === undefined) {
    if (method !== 'PUT') return fail(405, 'MethodNotAllowed', 'Use PUT');
    const asked = await privateWorks(request);
    if (!asked) return fail(400, 'InvalidRequest', `The body is { works: 1 to ${mostWorks} Catalog identifiers, private: boolean }`);
    return reply(200, await sharing.setPrivateWorks(account, asked.works, asked.kept));
  }
  if ((kind !== 'categories' && kind !== 'private-works') || name === undefined || rest.length > 0) {
    return fail(404, 'NotFound', 'Unknown sharing path');
  }
  if (method !== 'PUT') return fail(405, 'MethodNotAllowed', 'Use PUT');

  if (kind === 'private-works') {
    if (!isWorkId(name)) return fail(400, 'InvalidWork', 'A Work is a Catalog identifier');
    const kept = await flag(request, 'private');
    if (kept === undefined) return fail(400, 'InvalidRequest', 'The body is { private: boolean }');
    return reply(200, await sharing.setPrivate(account, name, kept));
  }

  if (!isCategory(name)) return fail(400, 'InvalidCategory', 'Unknown sharing category');
  const shared = await flag(request, 'shared');
  if (shared === undefined) return fail(400, 'InvalidRequest', 'The body is { shared: boolean }');
  try {
    return reply(200, await sharing.setShared(account, name, shared));
  } catch (error) {
    if (error instanceof NeedsConsentError) return fail(403, 'NeedsConsent', error.message);
    logFailure('start', error);
    return fail(503, 'PdsUnreachable', 'The PDS could not be reached');
  }
}
