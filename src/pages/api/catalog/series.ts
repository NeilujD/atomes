import type { APIRoute } from 'astro';
import { answerFindSeries } from '../../../lib/catalog/api';
import { catalog, catalogAccess } from '../../../lib/catalog/instance';

// Signed-in readers only (api.ts): the Series a Series Correction picks from.
export const GET: APIRoute = async ({ request, url }) =>
  answerFindSeries(catalog(), url, { signedIn: (await catalogAccess()).signedIn(request) });
