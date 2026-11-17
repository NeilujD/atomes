// The Invite a reader makes in Settings, for the Account of the browser session
// only: src/lib/server/reader-invite.ts. The POST is refused from another site
// by the middleware (security.ts), as /api/invite.
import type { APIRoute } from 'astro';
import { accountStore, authDeps } from '../../../lib/server/instance';
import { handleReaderInvite } from '../../../lib/server/reader-invite';

const handle: APIRoute = async ({ request }) => handleReaderInvite(request, { store: (await authDeps()).store, accounts: accountStore() });

export const GET = handle;
export const POST = handle;
