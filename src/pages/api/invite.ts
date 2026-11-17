// The sign-in screen posts the Invite of its link here; the answer keeps it in
// a cookie for the sign-in that follows (keepInvite in src/lib/server/auth.ts).
import type { APIRoute } from 'astro';
import { keepInvite } from '../../lib/server/auth';
import { accountStore } from '../../lib/server/instance';

export const POST: APIRoute = ({ request }) => keepInvite(request, { accounts: accountStore() });
