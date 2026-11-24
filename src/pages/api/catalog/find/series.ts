import type { APIRoute } from 'astro';
import { answerSeriesVolumes } from '../../../../lib/catalog/api';
import { catalog, catalogAccess } from '../../../../lib/catalog/instance';
import { requestLanguage } from '../../../../lib/i18n/i18n';

// Search (ADR 0021, CORE-187): the Volumes of a Series, for signed-in readers only (api.ts).
export const GET: APIRoute = async ({ request, url }) =>
  answerSeriesVolumes(catalog(), url, { signedIn: (await catalogAccess()).signedIn(request), language: requestLanguage(request) });
