// The sign-in, Library and sharing parts of this server, built once from its
// settings: `auth.sqlite` and `library.sqlite` in DATA_DIR (ADR 0012, ADR 0013).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { NodeOAuthClient } from '@atproto/oauth-client-node';
import type { AuthDeps } from './auth';
import { createAuthStore } from './auth-store';
import { createLibraryStore, type LibraryStore } from './library-store';
import { createOAuthClient, oauthPort, repoAccess } from './oauth';
import { secretBox } from './secret-box';
import { settings } from './settings';
import { createSharing, logFailure, type Sharing } from './sharing';

let library: LibraryStore | undefined;
let sharing: Promise<Sharing> | undefined;
let auth: Promise<AuthDeps & { client: NodeOAuthClient }> | undefined;

function dataDir() {
  const dir = settings().dataDir;
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function libraryStore(): LibraryStore {
  library ??= createLibraryStore(join(dataDir(), 'library.sqlite'));
  return library;
}

export function authDeps(): Promise<AuthDeps & { client: NodeOAuthClient }> {
  auth ??= (async () => {
    const { allowedDids, appOrigin, sessionKey } = settings();
    const store = createAuthStore({ file: join(dataDir(), 'auth.sqlite'), box: secretBox(sessionKey), allowedDids });
    const client = await createOAuthClient(settings(), store);
    // Signed in again: send what waited for the session (sharing.ts).
    const onSignedIn = (did: string) =>
      sharingService()
        .then((sharing) => sharing.signedIn(did))
        .catch((error: unknown) => logFailure('after sign-in', error));
    return { oauth: oauthPort(client, allowedDids), store, appOrigin, client, onSignedIn };
  })();
  return auth;
}

// Shared categories and Private Works live in `library.sqlite` too.
export function sharingService(): Promise<Sharing> {
  sharing ??= authDeps().then(({ client }) =>
    createSharing({ file: join(dataDir(), 'library.sqlite'), library: libraryStore(), access: repoAccess(client) }),
  );
  return sharing;
}
