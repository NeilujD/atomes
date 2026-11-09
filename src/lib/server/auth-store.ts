// What the instance keeps to sign readers in (ADR 0013), in its own SQLite
// file, apart from the Library and the Catalog: losing it only signs readers out.
// - OAuth sign-ins in progress and OAuth sessions (tokens, DPoP keys): sealed
//   with SESSION_ENCRYPTION_KEY, never in plain text.
// - Browser sessions: the cookie value is stored only as its SHA-256 hash.
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { SecretBox } from './secret-box';

// The store shape that `@atproto/oauth-client-node` asks for (`SimpleStore`).
export interface SealedStore<T> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
}

export interface BrowserSession {
  did: string;
  handle: string;
}

export interface AuthStore {
  // OAuth sign-ins in progress, kept one hour.
  states<T>(): SealedStore<T>;
  // OAuth sessions, one per DID. Refuses, and stores nothing for, a DID that
  // is not allowed on this instance.
  sessions<T>(): SealedStore<T>;
  // A new browser session; gives the cookie value.
  openBrowserSession(session: BrowserSession): string;
  // Undefined when the value is unknown, expired, or its DID is no longer allowed.
  browserSession(cookie: string): BrowserSession | undefined;
  // Ends one browser session; gives its DID when there was one.
  closeBrowserSession(cookie: string): string | undefined;
  // True while another browser session of the DID is still open.
  hasBrowserSessions(did: string): boolean;
  close(): void;
}

// The DID is not on ALLOWED_DIDS.
export class NotAllowedError extends Error {
  constructor(did: string) {
    super(`${did} may not sign in to this instance`);
    this.name = 'NotAllowedError';
  }
}

const stateLifetimeMs = 3600 * 1000;
// The OAuth session can last longer (2 years, spike 0003); the browser asks
// for a new sign-in after this.
export const browserSessionLifetimeMs = 180 * 24 * 3600 * 1000;

const schema = `
  create table if not exists oauth_state (
    key text primary key,
    sealed text not null,
    created_at integer not null
  );
  create table if not exists oauth_session (
    did text primary key,
    sealed text not null,
    updated_at integer not null
  );
  create table if not exists browser_session (
    token_hash text primary key,
    did text not null,
    handle text not null,
    expires_at integer not null
  );
  create index if not exists browser_session_did on browser_session (did);
`;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export function createAuthStore(options: {
  file: string;
  box: SecretBox;
  allowedDids: ReadonlySet<string>;
  now?: () => number;
}): AuthStore {
  const { box, allowedDids } = options;
  const now = options.now ?? Date.now;
  const db = new DatabaseSync(options.file);
  db.exec(schema);

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
        if (!allowedDids.has(did)) throw new NotAllowedError(did);
      }),
    openBrowserSession({ did, handle }) {
      if (!allowedDids.has(did)) throw new NotAllowedError(did);
      const token = randomBytes(32).toString('base64url');
      db.prepare('delete from browser_session where expires_at < ?').run(now());
      db.prepare('insert into browser_session (token_hash, did, handle, expires_at) values (?, ?, ?, ?)').run(
        hash(token),
        did,
        handle,
        now() + browserSessionLifetimeMs,
      );
      return token;
    },
    browserSession(cookie) {
      const row = db
        .prepare('select did, handle from browser_session where token_hash = ? and expires_at > ?')
        .get(hash(cookie), now()) as BrowserSession | undefined;
      return row && allowedDids.has(row.did) ? { did: row.did, handle: row.handle } : undefined;
    },
    closeBrowserSession(cookie) {
      const row = db.prepare('delete from browser_session where token_hash = ? returning did').get(hash(cookie)) as
        | { did: string }
        | undefined;
      return row?.did;
    },
    hasBrowserSessions(did) {
      return db.prepare('select 1 from browser_session where did = ? and expires_at > ?').get(did, now()) !== undefined;
    },
    close: () => db.close(),
  };
}
