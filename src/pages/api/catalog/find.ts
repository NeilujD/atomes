import type { APIRoute } from 'astro';
import { answerFind } from '../../../lib/catalog/api';
import { requestLanguage } from '../../../lib/i18n/i18n';
import { catalog, catalogAccess } from '../../../lib/catalog/instance';

// Search (ADR 0021): signed-in readers only (api.ts), each search costs source calls.
export const GET: APIRoute = async ({ request, url }) => 
  answerFind(catalog(), url, { signedIn: (await catalogAccess()).signedIn(request), language: requestLanguage(request) });
