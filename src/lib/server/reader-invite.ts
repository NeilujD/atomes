// A reader makes an Invite in Settings (CORE-134), for the Account of the
// browser session only: no request names an Account.
//   GET  /api/account/invite  { state: 'none' | 'open' | 'used', expiresAt? }
//   POST /api/account/invite  201 { token, expiresAt }: a new Invite, which
//                             cancels the open one. 403 once a person made an
//                             Account with an Invite of this reader.
// The token is in this answer only: never stored, never logged. The
// middleware refuses a POST from another site (security.ts).
import type { Accounts } from './accounts';
import { readerOf, signedOut } from './auth';
import type { AuthStore } from './auth-store';

export interface ReaderInviteDeps {
  store: AuthStore;
  accounts: Pick<Accounts, 'inviteOf' | 'makeInvite'>;
}

const noStore = { 'cache-control': 'no-store' };

// Astro routes GET and POST only here (src/pages/api/account/invite.ts).
export function handleReaderInvite(request: Request, { store, accounts }: ReaderInviteDeps): Response {
  const reader = readerOf(request, { store });
  if (!reader) return signedOut();
  if (request.method !== 'POST') return Response.json(accounts.inviteOf(reader.account), { headers: noStore });
  const made = accounts.makeInvite(reader.account);
  if (!made) return Response.json({ error: 'InviteUsed', message: 'You have used your Invite' }, { status: 403, headers: noStore });
  return Response.json(made, { status: 201, headers: noStore });
}
