import type { APIRoute } from 'astro';
import { answerSearch } from '../../../lib/catalog/api';
import { catalog, catalogAccess } from '../../../lib/catalog/instance';

// Signed-in readers only (api.ts): a search costs a BnF call.
export const GET: APIRoute = async ({ request, url }) =>
  answerSearch(catalog(), url, { signedIn: (await catalogAccess()).signedIn(request) });
