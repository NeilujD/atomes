// The PDS sends the reader back here after sign-in; the answer goes to Settings.
import type { APIRoute } from 'astro';
import { callback } from '../../lib/server/auth';
import { authDeps } from '../../lib/server/instance';

export const GET: APIRoute = async ({ request }) => callback(request, await authDeps());
