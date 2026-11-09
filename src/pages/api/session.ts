// Who is signed in on this browser: { did, handle }, or 401.
import type { APIRoute } from 'astro';
import { session } from '../../lib/server/auth';
import { authDeps } from '../../lib/server/instance';

export const GET: APIRoute = async ({ request }) => session(request, await authDeps());
