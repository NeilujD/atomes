// The sign-in screen sends the Sign-in Code here; the right one signs the
// browser in (checkCode in src/lib/server/email-sign-in.ts).
import type { APIRoute } from 'astro';
import { checkCode } from '../../../lib/server/email-sign-in';
import { emailSignInDeps } from '../../../lib/server/instance';

export const POST: APIRoute = async ({ request, clientAddress }) => checkCode(request, await emailSignInDeps(), clientAddress);
