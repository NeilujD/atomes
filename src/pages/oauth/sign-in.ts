// The sign-in screen posts here; the answer sends the reader to their PDS.
import type { APIRoute } from 'astro';
import { signIn } from '../../lib/server/auth';
import { authDeps } from '../../lib/server/instance';

export const POST: APIRoute = async ({ request }) => signIn(request, await authDeps());
