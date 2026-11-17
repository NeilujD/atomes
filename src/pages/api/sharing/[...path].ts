// What the reader shares, for the Account of the browser session only: src/lib/server/sharing-api.ts.
import type { APIRoute } from 'astro';
import { readerOf, signedOut } from '../../../lib/server/auth';
import { authDeps, sharingService } from '../../../lib/server/instance';
import { handleSharingRequest } from '../../../lib/server/sharing-api';

export const ALL: APIRoute = async ({ request }) => {
  const reader = readerOf(request, await authDeps());
  if (!reader) return signedOut();
  return handleSharingRequest(request, { account: reader.account, sharing: await sharingService() });
};
