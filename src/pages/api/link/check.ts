// Settings sends the code here; the right one adds the address (checkLinkCode in src/lib/server/link-email.ts).
import type { APIRoute } from 'astro';
import { linkEmailDeps } from '../../../lib/server/instance';
import { checkLinkCode } from '../../../lib/server/link-email';

export const POST: APIRoute = async ({ request }) => checkLinkCode(request, await linkEmailDeps());
