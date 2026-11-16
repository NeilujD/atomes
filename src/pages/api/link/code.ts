// Settings asks here for a code to add an email address (sendLinkCode in src/lib/server/link-email.ts).
import type { APIRoute } from 'astro';
import { linkEmailDeps } from '../../../lib/server/instance';
import { sendLinkCode } from '../../../lib/server/link-email';

export const POST: APIRoute = async ({ request }) => sendLinkCode(request, await linkEmailDeps());
