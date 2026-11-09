// The public key of the confidential client: the PDS checks the client's
// signed assertions with it. Never the private key (`client.jwks` holds public keys only).
import type { APIRoute } from 'astro';
import { authDeps } from '../../lib/server/instance';
import { settings } from '../../lib/server/settings';

export const GET: APIRoute = async () => {
  if (!settings().appOrigin) return new Response('PUBLIC_APP_ORIGIN is not set: this instance uses the loopback client.', { status: 404 });
  return Response.json((await authDeps()).client.jwks);
};
