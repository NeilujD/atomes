// The OAuth client metadata of this Atomes instance (ADR 0013). The PDS fetches
// it to learn who is asking. Read at request time, so one built image serves any origin.
import type { APIRoute } from 'astro';
import { confidentialClientMetadata } from '../../lib/auth/client-config';
import { settings } from '../../lib/server/settings';

export const GET: APIRoute = () => {
  const { appOrigin } = settings();
  if (!appOrigin) return new Response('PUBLIC_APP_ORIGIN is not set: this instance uses the loopback client.', { status: 404 });
  return Response.json(confidentialClientMetadata(appOrigin));
};
