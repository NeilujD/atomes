// What the instance keeps to sign readers in (ADR 0013), in its own SQLite
// file, apart from the Library and the Catalog: losing it only signs readers out.
// - OAuth sign-ins in progress and OAuth sessions (tokens, DPoP keys): sealed
//   with SESSION_ENCRYPTION_KEY, never in plain text.
// - Browser sessions: the cookie value is stored only as its SHA-256 hash.
//   Each holds the Account it signs in to (ADR 0016); the OAuth session stays
//   keyed by DID.
import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { AccountId, Accounts, Did } from './accounts';
import type { SecretBox } from './secret-box';

// The store shape that `@atproto/oauth-client-node` asks for (`SimpleStore`).
export interface SealedStore<T> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
}

export interface BrowserSession {
  account: AccountId;
  handle: string;
}

export interface AuthStore {
  // OAuth sign-ins in progress, kept one hour.
  states<T>(): SealedStore<T>;
  // OAuth sessions, one per DID. Refuses, and stores nothing for, a DID that
  // is not allowed on this instance.
  sessions<T>(): SealedStore<T>;
  // A new browser session for the Account of the DID (made at its first
  // sign-in); gives the cookie value and the Account.
  openBrowserSession(session: { did: Did; handle: string }): { cookie: string; account: AccountId };
  // Undefined when the value is unknown, expired, or the DID of its Account
  // is no longer allowed.
  browserSession(cookie: string): BrowserSession | undefined;
  // Ends one browser session; gives its Account when there was one.
  closeBrowserSession(cookie: string): AccountId | undefined;
  // True while another browser session of the Account is still open.
  hasBrowserSessions(account: AccountId): boolean;
  // Ends every browser session of the Account, and deletes the OAuth session
  // of its DID (CORE-55).
  forget(account: AccountId, did?: Did): void;
  close(): void;
}

// The DID is not on ALLOWED_DIDS.
export class NotAllowedError extends Error {
  // The message never names the DID: it is logged.
  constructor() {
    super('This DID may not sign in to this instance');
    this.name = 'NotAllowedError';
  }
}

const stateLifetimeMs = 3600 * 1000;
// The OAuth session can last longer (2 years, spike 0003); the browser asks
// for a new sign-in after this.
export const browserSessionLifetimeMs = 180 * 24 * 3600 * 1000;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export function createAuthStore(options: {
  // Has run `authSteps` (migrations.ts). The store closes it.
  db: DatabaseSync;
  box: SecretBox;
  allowedDids: ReadonlySet<string>;
  // In library.sqlite.
  accounts: Pick<Accounts, 'ofDid' | 'identitiesOf'>;
  now?: () => number;
}): AuthStore {
  const { db, box, allowedDids, accounts } = options;
  const now = options.now ?? Date.now;
  // ALLOWED_DIDS decides who may sign in, until Invites.
  const allowed = (account: AccountId) => {
    const { did } = accounts.identitiesOf(account);
    return did !== undefined && allowedDids.has(did);
  };

  function sealed<T>(table: 'oauth_state' | 'oauth_session', keyColumn: 'key' | 'did', allow: (key: string) => void) {
    const timeColumn = table === 'oauth_state' ? 'created_at' : 'updated_at';
    const store: SealedStore<T> = {
      get: (key) => {
        const row = db.prepare(`select sealed from ${table} where ${keyColumn} = ?`).get(key) as { sealed: string } | undefined;
        return Promise.resolve(row && (box.open(row.sealed) as T));
      },
      set: (key, value) => {
        allow(key);
        db.prepare(
          `insert into ${table} (${keyColumn}, sealed, ${timeColumn}) values (?, ?, ?)
           on conflict (${keyColumn}) do update set sealed = excluded.sealed, ${timeColumn} = excluded.${timeColumn}`,
        ).run(key, box.seal(value), now());
        return Promise.resolve();
      },
      del: (key) => {
        db.prepare(`delete from ${table} where ${keyColumn} = ?`).run(key);
        return Promise.resolve();
      },
    };
    return store;
  }

  return {
    states: <T>() =>
      sealed<T>('oauth_state', 'key', () => {
        db.prepare('delete from oauth_state where created_at < ?').run(now() - stateLifetimeMs);
      }),
    sessions: <T>() =>
      sealed<T>('oauth_session', 'did', (did) => {
        if (!allowedDids.has(did)) throw new NotAllowedError();
      }),
    openBrowserSession({ did, handle }) {
      if (!allowedDids.has(did)) throw new NotAllowedError();
      const account = accounts.ofDid(did);
      const token = randomBytes(32).toString('base64url');
      db.prepare('delete from browser_session where expires_at < ?').run(now());
      db.prepare('insert into browser_session (token_hash, account, handle, expires_at) values (?, ?, ?, ?)').run(
        hash(token),
        account,
        handle,
        now() + browserSessionLifetimeMs,
      );
      return { cookie: token, account };
    },
    browserSession(cookie) {
      const row = db
        .prepare('select account, handle from browser_session where token_hash = ? and expires_at > ?')
        .get(hash(cookie), now()) as BrowserSession | undefined;
      return row && allowed(row.account) ? { account: row.account, handle: row.handle } : undefined;
    },
    closeBrowserSession(cookie) {
      const row = db.prepare('delete from browser_session where token_hash = ? returning account').get(hash(cookie)) as
        | { account: AccountId }
        | undefined;
      return row?.account;
    },
    hasBrowserSessions(account) {
      return db.prepare('select 1 from browser_session where account = ? and expires_at > ?').get(account, now()) !== undefined;
    },
    forget(account, did) {
      db.prepare('delete from browser_session where account = ?').run(account);
      if (did) db.prepare('delete from oauth_session where did = ?').run(did);
    },
    close: () => db.close(),
  };
}
