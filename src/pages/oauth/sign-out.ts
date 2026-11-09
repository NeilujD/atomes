import type { APIRoute } from 'astro';
import { signOut } from '../../lib/server/auth';
import { authDeps } from '../../lib/server/instance';

export const POST: APIRoute = async ({ request }) => signOut(request, await authDeps());
