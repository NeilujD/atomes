// Export and delete, for the Account of the browser session only: src/lib/server/account-data.ts.
// The delete is a POST: the middleware refuses it from another site (security.ts).
import type { APIRoute } from 'astro';
import { catalog } from '../../../lib/catalog/instance';
import { handleAccountRequest } from '../../../lib/server/account-data';
import { readerOf, signedOut } from '../../../lib/server/auth';
import { accountStore, authDeps, libraryStore, sharingService } from '../../../lib/server/instance';

export const ALL: APIRoute = async ({ request }) => {
  const deps = await authDeps();
  const reader = readerOf(request, deps);
  if (!reader) return signedOut();
  return handleAccountRequest(request, {
    account: reader.account,
    accounts: accountStore(),
    library: libraryStore(),
    sharing: await sharingService(),
    auth: deps.store,
    revoke: (did) => deps.oauth.revoke(did),
    catalog: catalog(),
  });
};
