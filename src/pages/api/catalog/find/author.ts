import type { APIRoute } from 'astro';
import { answerAuthorWorks } from '../../../../lib/catalog/api';
import { catalog, catalogAccess } from '../../../../lib/catalog/instance';

// Search (ADR 0021, CORE-188): the Works of an Author, for signed-in readers only (api.ts).
export const GET: APIRoute = async ({ request, url }) =>
  answerAuthorWorks(catalog(), url, { signedIn: (await catalogAccess()).signedIn(request) });
