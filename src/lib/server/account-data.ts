// What a reader can do with the data this instance keeps of them (ADR 0012,
// ADR 0016, CORE-55), always for the Account of the browser session: no
// request names an Account.
//   GET  /api/account/export  One JSON file: every record of the Account, in
//                             lexicon shape, by collection, and its identities.
//   POST /api/account/delete  Deletes the Account: records, Shared choices,
//                             identities, sessions, OAuth session. Answers
//                             { sharedLeft } and removes the cookie.
// The privacy notice (src/pages/privacy.astro) points to both.
import { lexicons } from '../library/records';
import type { AccountId, Accounts, Did } from './accounts';
import { sessionCookieHeader } from './auth';
import type { AuthStore } from './auth-store';
import type { LibraryStore } from './library-store';
import type { Sharing } from './sharing';

// What the delete of an Account needs: every store that keeps a row of it.
export interface DeleteDeps {
  accounts: Pick<Accounts, 'identitiesOf' | 'forget'>;
  library: Pick<LibraryStore, 'forget'>;
  sharing: Pick<Sharing, 'forget'>;
  auth: Pick<AuthStore, 'forget'>;
  // Ends the OAuth session of the DID on its PDS and here (OAuthPort.revoke).
  revoke: (did: Did) => Promise<void>;
  // The Catalog keeps a Series Correction for every reader, without its author.
  catalog: { forgetAuthor(account: AccountId): void };
}

export interface AccountDataDeps extends DeleteDeps {
  account: AccountId;
  library: Pick<LibraryStore, 'changesSince' | 'forget'>;
}

// Every record type of the lexicons (ADR 0010).
const recordCollections = [...lexicons].flatMap((doc) => (doc.defs.main?.type === 'record' ? [doc.id] : [])).sort();

const noStore = { 'cache-control': 'no-store' };

export async function handleAccountRequest(request: Request, deps: AccountDataDeps): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === '/api/account/export' && request.method === 'GET') return exportLibrary(deps);
  if (pathname === '/api/account/delete' && request.method === 'POST') return deleteAccount(deps);
  return Response.json({ error: 'NotFound', message: 'Not found' }, { status: 404, headers: noStore });
}

function exportLibrary({ account, accounts, library }: AccountDataDeps): Response {
  const records: Record<string, { rkey: string; value: unknown }[]> = Object.fromEntries(recordCollections.map((collection) => [collection, []]));
  for (const { collection, rkey, value } of library.changesSince(account, 0).records) {
    (records[collection] ??= []).push({ rkey, value });
  }
  for (const list of Object.values(records)) list.sort((a, b) => (a.rkey < b.rkey ? -1 : a.rkey > b.rkey ? 1 : 0));
  const { did, email } = accounts.identitiesOf(account);
  const now = new Date();
  const body = { exportedAt: now.toISOString(), identities: { email, atprotoAccount: did }, records };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      ...noStore,
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="atomes-library-${now.toISOString().slice(0, 10)}.json"`,
    },
  });
}

// The full delete of an Account (CORE-55), for "Delete my account" and for the
// delete by an Admin (ADR 0020): the Shared records on the PDS first, while the
// OAuth session can still reach it; then every row of the instance, whatever
// the PDS answered: the Library, the author of its Series Corrections, its
// sessions, its open Invites, its role, its identities and the Account.
// `sharedLeft`: the Shared records stay on the PDS, which could not be reached.
export async function forgetAccount(account: AccountId, { accounts, library, sharing, auth, revoke, catalog }: DeleteDeps): Promise<{ sharedLeft: boolean }> {
  const { did } = accounts.identitiesOf(account);
  const { sharedLeft } = await sharing.forget(account);
  if (did) await revoke(did).catch(() => undefined);
  library.forget(account);
  catalog.forgetAuthor(account);
  auth.forget(account, did);
  accounts.forget(account);
  return { sharedLeft };
}

async function deleteAccount(deps: AccountDataDeps): Promise<Response> {
  const { sharedLeft } = await forgetAccount(deps.account, deps);
  return Response.json({ sharedLeft }, { headers: { ...noStore, 'set-cookie': sessionCookieHeader('', 0) } });
}
