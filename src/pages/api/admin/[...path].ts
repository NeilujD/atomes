// The admin API (ADR 0020): src/lib/server/admin.ts checks the session and the
// role on every request, and answers a bare 404 to anyone else.
import type { APIRoute } from 'astro';
import { handleAdminRequest } from '../../../lib/server/admin';
import { adminDeps } from '../../../lib/server/admin-instance';

export const ALL: APIRoute = async (context) => {
  const response = await handleAdminRequest(context.request, await adminDeps());
  // Not an Admin, or no such admin route: the 404 page of the app, the answer
  // to a path that does not exist, so this route does not show that it exists.
  return response.status === 404 ? context.rewrite('/404') : response;
};
