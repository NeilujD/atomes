import type { APIRoute } from 'astro';
import { checkWrite } from '../../../../../lib/catalog/access';
import { answerCorrect, answerUncorrect } from '../../../../../lib/catalog/api';
import { catalog, catalogAccess } from '../../../../../lib/catalog/instance';

// A reader's Series Correction (ADR 0017). Signed-in readers only, with a
// limit per Account: it writes to the Catalog every reader of the instance reads.
export const PUT: APIRoute = async ({ params, request }) => {
  const write = checkWrite(request, await catalogAccess());
  if ('refused' in write) return write.refused;
  const body: unknown = await request.json().catch(() => undefined);
  return answerCorrect(catalog(), params.isbn, body, write.account);
};

// "Back to the sources".
export const DELETE: APIRoute = async ({ params, request }) => {
  const write = checkWrite(request, await catalogAccess());
  return 'refused' in write ? write.refused : answerUncorrect(catalog(), params.isbn);
};
