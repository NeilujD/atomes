// What the instance keeps to sign readers in (ADR 0013), in its own SQLite
// file, apart from the Library and the Catalog: losing it only signs readers out.
// - OAuth sign-ins in progress and OAuth sessions (tokens, DPoP keys): sealed
//   with SESSION_ENCRYPTION_KEY, never in plain text.
// - Browser sessions: the cookie value is stored only as its SHA-256 hash.
//   Each holds the Account it signs in to (ADR 0016); the OAuth session stays
//   keyed by DID.
import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { AccountId, Did } from './accounts';
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
  // OAuth sessions, one per DID. The sign-in (auth.ts) revokes the one of a
  // DID that may not make an Account.
  sessions<T>(): SealedStore<T>;
  // A new browser session for the Account; gives the cookie value.
  openBrowserSession(session: BrowserSession): { cookie: string };
  // Undefined when the value is unknown or expired.
  browserSession(cookie: string): BrowserSession | undefined;
  // Ends one browser session; gives its Account when there was one.
  closeBrowserSession(cookie: string): AccountId | undefined;
  // The handle of every browser session of the Account, after a link.
  setHandle(account: AccountId, handle: string): void;
  // The handle of the newest browser session of the Account that has one: how
  // the admin panel names an Admin with no email address (ADR 0020).
  handleOf(account: AccountId): string | undefined;
  // The number of open browser sessions of each Account that has one (admin panel, ADR 0020).
  sessionCounts(): Map<string, number>;
  // True while another browser session of the Account is still open.
  hasBrowserSessions(account: AccountId): boolean;
  // Ends every browser session of the Account, and deletes the OAuth session
  // of its DID (CORE-55).
  forget(account: AccountId, did?: Did): void;
  close(): void;
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
  now?: () => number;
  // Called with the Account of each request whose session is read (the last active day, ADR 0020).
  seen?: (account: AccountId) => void;
}): AuthStore {
  const { db, box } = options;
  const now = options.now ?? Date.now;

  function sealed<T>(table: 'oauth_state' | 'oauth_session', keyColumn: 'key' | 'did', beforeSet: () => void = () => {}) {
    const timeColumn = table === 'oauth_state' ? 'created_at' : 'updated_at';
    const store: SealedStore<T> = {
      get: (key) => {
        const row = db.prepare(`select sealed from ${table} where ${keyColumn} = ?`).get(key) as { sealed: string } | undefined;
        return Promise.resolve(row && (box.open(row.sealed) as T));
      },
      set: (key, value) => {
        beforeSet();
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
    sessions: <T>() => sealed<T>('oauth_session', 'did'),
    openBrowserSession({ account, handle }) {
      const token = randomBytes(32).toString('base64url');
      db.prepare('delete from browser_session where expires_at < ?').run(now());
      db.prepare('insert into browser_session (token_hash, account, handle, expires_at) values (?, ?, ?, ?)').run(
        hash(token),
        account,
        handle,
        now() + browserSessionLifetimeMs,
      );
      return { cookie: token };
    },
    browserSession(cookie) {
      const row = db
        .prepare('select account, handle from browser_session where token_hash = ? and expires_at > ?')
        .get(hash(cookie), now()) as BrowserSession | undefined;
      if (row) options.seen?.(row.account);
      return row && { account: row.account, handle: row.handle };
    },
    closeBrowserSession(cookie) {
      const row = db.prepare('delete from browser_session where token_hash = ? returning account').get(hash(cookie)) as
        | { account: AccountId }
        | undefined;
      return row?.account;
    },
    setHandle(account, handle) {
      db.prepare('update browser_session set handle = ? where account = ?').run(handle, account);
    },
    handleOf(account) {
      const row = db.prepare("select handle from browser_session where account = ? and handle != '' order by expires_at desc limit 1").get(account) as
        | { handle: string }
        | undefined;
      return row?.handle;
    },
    sessionCounts() {
      const rows = db.prepare('select account, count(*) as n from browser_session where expires_at > ? group by account').all(now()) as { account: string; n: number }[];
      return new Map(rows.map(({ account, n }) => [account, n]));
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
