// Development only: signs this browser in as a test reader, with no PDS
// (signInAs in src/lib/server/auth.ts). 404 in a built server: the check is
// on import.meta.env.DEV, fixed at build time, never on a setting that an
// instance could change. A GET that sets a cookie is open to login CSRF; this
// is accepted only because the page exists only on the dev server, on 127.0.0.1.
import type { APIRoute } from 'astro';
import { signInAs } from '../../lib/server/auth';
import { authDeps } from '../../lib/server/instance';
import { settings } from '../../lib/server/settings';

export const GET: APIRoute = async ({ request }) => {
  if (!import.meta.env.DEV) return new Response(null, { status: 404 });
  return signInAs(request, await authDeps(), settings().allowedDids);
};
