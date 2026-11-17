// Settings posts here to link an AT Protocol Account to the signed-in Account
// (linkAtproto in src/lib/server/auth.ts); the answer sends the reader to their PDS.
import type { APIRoute } from 'astro';
import { linkAtproto } from '../../lib/server/auth';
import { authDeps } from '../../lib/server/instance';

export const POST: APIRoute = async ({ request }) => linkAtproto(request, await authDeps());
