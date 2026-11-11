import type { APIRoute } from 'astro';
import { checkAccess } from '../../../../lib/catalog/access';
import { answerChoose, answerEdition } from '../../../../lib/catalog/api';
import { catalog, catalogAccess } from '../../../../lib/catalog/instance';

export const GET: APIRoute = async ({ params, request, clientAddress }) => {
  const access = checkAccess(request, clientAddress, await catalogAccess());
  return 'refused' in access ? access.refused : answerEdition(catalog(), params.isbn);
};

// A reader's choice for an ISBN no source knows (CORE-40). Signed-in readers
// only: it writes to the Catalog every reader of the instance reads.
export const PUT: APIRoute = async ({ params, request }) => {
  const body: unknown = await request.json().catch(() => undefined);
  return answerChoose(catalog(), params.isbn, body, { signedIn: (await catalogAccess()).signedIn(request) });
};
