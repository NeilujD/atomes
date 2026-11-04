// The OAuth client metadata of this Atomes instance (ADR 0009). The PDS fetches
// it to learn who is asking; the browser client loads the same object.
// Read at request time, so one built image serves any origin.
import type { APIRoute } from 'astro';
import { webClientMetadata } from '../../lib/auth/client-config';

export const GET: APIRoute = () => {
  const origin = process.env.PUBLIC_APP_ORIGIN;
  if (!origin) return new Response('PUBLIC_APP_ORIGIN is not set: this instance uses the loopback client.', { status: 404 });
  return Response.json(webClientMetadata(origin));
};
