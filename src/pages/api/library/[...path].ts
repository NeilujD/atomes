// The reader's Private records on this instance (ADR 0012): src/lib/server/library-api.ts.
import type { APIRoute } from 'astro';
import { readerOf, signedOut } from '../../../lib/server/auth';
import { authDeps, libraryStore } from '../../../lib/server/instance';
import { handleLibraryRequest, lexiconRules } from '../../../lib/server/library-api';

export const ALL: APIRoute = async ({ request }) => {
  const reader = readerOf(request, await authDeps());
  if (!reader) return signedOut();
  return handleLibraryRequest(request, { did: reader.did, store: libraryStore(), rules: lexiconRules });
};
