// Development only: the last mail sent to `?to=<address>` by the dev server,
// as plain text (devOutbox in src/lib/server/mail.ts), so agents and the E2E
// readers read their Sign-in Code. 404 in a built server, as /dev/sign-in-as:
// the check is on import.meta.env.DEV, fixed at build time. No mail: 404.
import type { APIRoute } from 'astro';
import { outbox } from '../../lib/server/instance';
import { normalEmail } from '../../lib/server/sign-in-codes';

export const GET: APIRoute = ({ url }) => {
  if (!import.meta.env.DEV) return new Response(null, { status: 404 });
  const mail = outbox.last(normalEmail(url.searchParams.get('to')) ?? '');
  if (!mail) return new Response(null, { status: 404 });
  return new Response(mail.text, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
};
