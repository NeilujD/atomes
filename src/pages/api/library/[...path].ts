// The reader's Private records on this instance (ADR 0012): src/lib/server/library-api.ts.
// A change in a Shared category also goes to the reader's PDS, after the
// answer (src/lib/server/sharing.ts).
import type { APIRoute } from 'astro';
import { readerOf, signedOut } from '../../../lib/server/auth';
import { authDeps, libraryStore, sharingService } from '../../../lib/server/instance';
import { handleLibraryRequest, lexiconRules } from '../../../lib/server/library-api';
import { logFailure } from '../../../lib/server/sharing';

export const ALL: APIRoute = async ({ request }) => {
  const reader = readerOf(request, await authDeps());
  if (!reader) return signedOut();
  const sharing = await sharingService();
  return handleLibraryRequest(request, {
    did: reader.did,
    store: libraryStore(),
    rules: lexiconRules,
    onWrite: (collection, rkey) => {
      sharing.recordChanged(reader.did, collection, rkey).catch((error: unknown) => logFailure('mirror', error));
    },
  });
};
