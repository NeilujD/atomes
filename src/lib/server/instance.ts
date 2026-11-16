// The sign-in, Library and sharing parts of this server, built once from its
// settings: `auth.sqlite` and `library.sqlite` in DATA_DIR (ADR 0012, ADR 0013).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { NodeOAuthClient } from '@atproto/oauth-client-node';
import { createAccounts, type AccountId, type Accounts } from './accounts';
import type { AuthDeps } from './auth';
import { createAuthStore } from './auth-store';
import { createLibraryStore, type LibraryStore } from './library-store';
import { openDatabase } from './migrate';
import { authSteps, librarySteps } from './migrations';
import { createOAuthClient, oauthPort, repoAccess } from './oauth';
import { secretBox } from './secret-box';
import { settings } from './settings';
import { createSharing, logFailure, type Sharing } from './sharing';

let library: LibraryStore | undefined;
let accounts: Accounts | undefined;
let sharing: Promise<Sharing> | undefined;
let auth: Promise<AuthDeps & { client: NodeOAuthClient }> | undefined;
let migrated: string | undefined;

// DATA_DIR, with the migration steps of `library.sqlite` and `auth.sqlite`
// run once, before any store opens (ADR 0016).
function dataDir() {
  if (migrated === undefined) {
    const dir = settings().dataDir;
    mkdirSync(dir, { recursive: true });
    // The auth steps read the Accounts of library.sqlite.
    const libraryAccounts = createAccounts(openDatabase(join(dir, 'library.sqlite'), librarySteps));
    try {
      openDatabase(join(dir, 'auth.sqlite'), authSteps(libraryAccounts)).close();
    } finally {
      libraryAccounts.close();
    }
    migrated = dir;
  }
  return migrated;
}

const open = (name: string) => new DatabaseSync(join(dataDir(), name));

export function libraryStore(): LibraryStore {
  library ??= createLibraryStore(open('library.sqlite'));
  return library;
}

// The Accounts and their identities, in `library.sqlite` (ADR 0016).
export function accountStore(): Accounts {
  accounts ??= createAccounts(open('library.sqlite'));
  return accounts;
}

export function authDeps(): Promise<AuthDeps & { client: NodeOAuthClient }> {
  auth ??= (async () => {
    const { allowedDids, appOrigin, sessionKey } = settings();
    const store = createAuthStore({ db: open('auth.sqlite'), box: secretBox(sessionKey), allowedDids, accounts: accountStore() });
    const client = await createOAuthClient(settings(), store);
    // Signed in again: send what waited for the session (sharing.ts).
    const onSignedIn = (account: AccountId) =>
      sharingService()
        .then((sharing) => sharing.signedIn(account))
        .catch((error: unknown) => logFailure('after sign-in', error));
    return { oauth: oauthPort(client, allowedDids), store, accounts: accountStore(), appOrigin, client, onSignedIn };
  })();
  return auth;
}

// Shared categories and Private Works live in `library.sqlite` too.
export function sharingService(): Promise<Sharing> {
  sharing ??= authDeps().then(({ client }) =>
    createSharing({
      db: open('library.sqlite'),
      library: libraryStore(),
      access: repoAccess(client),
      didOf: (account) => accountStore().identitiesOf(account).did,
    }),
  );
  return sharing;
}
