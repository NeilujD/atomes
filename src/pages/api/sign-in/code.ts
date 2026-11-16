// The sign-in screen asks for a Sign-in Code here (sendCode in src/lib/server/email-sign-in.ts).
import type { APIRoute } from 'astro';
import { sendCode } from '../../../lib/server/email-sign-in';
import { emailSignInDeps } from '../../../lib/server/instance';

export const POST: APIRoute = async ({ request, clientAddress }) => sendCode(request, await emailSignInDeps(), clientAddress);
