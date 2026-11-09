// The sign-in and Library parts of this server, built once from its settings:
// `auth.sqlite` and `library.sqlite` in DATA_DIR (ADR 0012, ADR 0013).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { NodeOAuthClient } from '@atproto/oauth-client-node';
import type { AuthDeps } from './auth';
import { createAuthStore } from './auth-store';
import { createLibraryStore, type LibraryStore } from './library-store';
import { createOAuthClient, oauthPort } from './oauth';
import { secretBox } from './secret-box';
import { settings } from './settings';

let library: LibraryStore | undefined;
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
    return { oauth: oauthPort(client, allowedDids), store, appOrigin, client };
  })();
  return auth;
}
