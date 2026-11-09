import type { APIRoute } from 'astro';
import { checkAccess } from '../../../../../lib/catalog/access';
import { answerVolumes } from '../../../../../lib/catalog/api';
import { catalog, catalogAccess } from '../../../../../lib/catalog/instance';

export const GET: APIRoute = async ({ params, request, clientAddress }) => {
  const access = checkAccess(request, clientAddress, await catalogAccess());
  return 'refused' in access ? access.refused : answerVolumes(catalog(), params.isbn, { fill: access.signedIn });
};
