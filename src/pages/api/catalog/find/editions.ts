import type { APIRoute } from 'astro';
import { answerWorkEditions } from '../../../../lib/catalog/api';
import { catalog, catalogAccess } from '../../../../lib/catalog/instance';

// Search (ADR 0021): the Editions of a Work, for signed-in readers only (api.ts).
export const GET: APIRoute = async ({ request, url }) =>
  answerWorkEditions(catalog(), url, { signedIn: (await catalogAccess()).signedIn(request) });
