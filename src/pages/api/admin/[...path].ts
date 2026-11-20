// The admin API (ADR 0020): src/lib/server/admin.ts checks the session and the
// role on every request, and answers 404 to anyone else.
import type { APIRoute } from 'astro';
import { handleAdminRequest } from '../../../lib/server/admin';
import { adminDeps } from '../../../lib/server/instance';

export const ALL: APIRoute = async ({ request }) => handleAdminRequest(request, await adminDeps());
