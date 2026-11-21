// The schemas of `library.sqlite` and `auth.sqlite`, one step per change
// (migrate.ts). `library.sqlite` is backed up and holds the readers' records
// (ADR 0016), so a step must keep every row: add a step at the end of a list;
// never edit or remove one. instance.ts runs them once, before any store opens.
import { newAccountId, type AccountId, type Did } from './accounts';
import type { Step } from './migrate';

// The Library (library-store.ts) and the sharing choices (sharing.ts), as
// before versioned migrations. Files made before have user_version 0 and these
// tables already. `rev` grows with each write of a reader: a device asks for
// the records changed since the last `rev` it has (ADR 0012). `purged` keeps,
// per reader, the newest rev of a purged tombstone.
const libraryV0: Step = (db) =>
  db.exec(`
    create table if not exists record (
      did text not null,
      collection text not null,
      rkey text not null,
      value text,
      rev integer not null,
      updated_at text not null,
      deleted integer not null default 0,
      primary key (did, collection, rkey)
    );
    create index if not exists record_rev on record (did, rev);
    create table if not exists purged (
      did text primary key,
      rev integer not null
    );
    create table if not exists shared_category (
      did text not null,
      category text not null,
      primary key (did, category)
    );
    create table if not exists private_work (
      did text not null,
      work text not null,
      primary key (did, work)
    );
    create table if not exists sharing_pending (
      did text primary key
    );
  `);

// Sign-in state (auth-store.ts), as before versioned migrations.
const authV0: Step = (db) =>
  db.exec(`
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
  `);

// The tables that hold a reader's rows, keyed by owner.
const ownedTables = ['record', 'purged', 'shared_category', 'private_work', 'sharing_pending'] as const;

// Accounts (ADR 0016, accounts.ts): an Account for each DID that owns a row,
// with the DID as its identity, and every row moves from the DID to the
// Account, under the same keys. No reverse: back up first.
const libraryV1: Step = (db) => {
  db.exec(`
    create table account (
      id text primary key,
      created_at text not null
    );
    create table identity (
      kind text not null check (kind in ('did', 'email')),
      value text not null,
      account text not null references account (id),
      primary key (kind, value),
      unique (account, kind)
    );
  `);
  const owners = db.prepare(ownedTables.map((table) => `select did from ${table}`).join(' union ')).all() as { did: string }[];
  const now = new Date().toISOString();
  for (const { did } of owners) {
    const account = newAccountId();
    db.prepare('insert into account (id, created_at) values (?, ?)').run(account, now);
    db.prepare("insert into identity (account, kind, value) values (?, 'did', ?)").run(account, did);
  }
  for (const table of ownedTables) {
    db.exec(`
      alter table ${table} rename column did to account;
      update ${table} set account = (select account from identity where kind = 'did' and value = ${table}.account);
    `);
  }
};

// Browser sessions hold the Account, not the DID: each open session moves to
// the Account of its DID, so no reader is signed out. `accounts` is the
// library.sqlite that has run librarySteps.
const authV1 =
  (accounts: { ofDid(did: Did): AccountId }): Step =>
  (db) => {
    db.exec(`
      drop index browser_session_did;
      alter table browser_session rename column did to account;
      create index browser_session_account on browser_session (account);
    `);
    const dids = db.prepare('select distinct account as did from browser_session').all() as { did: Did }[];
    const move = db.prepare('update browser_session set account = ? where account = ?');
    for (const { did } of dids) move.run(accounts.ofDid(did), did);
  };

// Invites (invites.ts): the hash of each token, never the token. `used_by` is
// the Account the Invite made.
const libraryV2: Step = (db) =>
  db.exec(`
    create table invite (
      token_hash text primary key,
      expires_at integer not null,
      used_by text references account (id),
      used_at integer
    );
  `);

// Sign-in Codes and sign-in limits (sign-in-codes.ts). An address is kept
// only as its SHA-256 hash, a code only as a hash with that address.
const authV2: Step = (db) =>
  db.exec(`
    create table sign_in_code (
      address_hash text primary key,
      code_hash text not null,
      expires_at integer not null,
      attempts_left integer not null
    );
    create table sign_in_limit (
      key text primary key,
      window_start integer not null,
      count integer not null
    );
  `);

// Invites that readers make in Settings (CORE-134): `made_by` is the Account
// that made it, null for the owner script.
const libraryV3: Step = (db) =>
  db.exec(`
    alter table invite add column made_by text references account (id);
    create index invite_made_by on invite (made_by);
  `);

// The Admin role (ADR 0020, roles.ts). `granted_by`: the Admin who granted
// it; null for scripts/role.ts.
const libraryV4: Step = (db) =>
  db.exec(`
    create table account_role (
      account text not null references account (id),
      role text not null check (role in ('admin')),
      granted_by text,
      granted_at integer not null,
      primary key (account, role)
    );
  `);

// The Admin Log (ADR 0020, admin-log.ts). No foreign key: a line stays when
// its Account goes.
const libraryV5: Step = (db) =>
  db.exec(`
    create table admin_action (
      id integer primary key,
      at integer not null,
      admin text,
      action text not null,
      target text,
      detail text
    );
    create index admin_action_at on admin_action (at);
  `);

// The last active day of an Account (ADR 0020): a calendar day in UTC, written
// once a day at most (accounts.ts, `seen`). Filled from the day of the last
// Library write, the only activity date the instance had; null with no write.
const libraryV6: Step = (db) =>
  db.exec(`
    alter table account add column last_active_day text;
    update account set last_active_day = (select substr(max(updated_at), 1, 10) from record where record.account = account.id);
  `);

// An Invite keeps its origin and a label (ADR 0020): a reader in Settings, an
// Admin in the panel, or scripts/invite.ts. The Invites made before: those
// with a maker are reader Invites, the others script Invites.
const libraryV7: Step = (db) =>
  db.exec(`
    alter table invite add column origin text not null default 'script' check (origin in ('reader', 'admin', 'script'));
    alter table invite add column label text;
    update invite set origin = 'reader' where made_by is not null;
  `);

// An Account keeps that an Admin added it by its email address, with no
// Invite (ADR 0020). No Account made before was added.
const libraryV8: Step = (db) => db.exec('alter table account add column added_by_admin integer not null default 0');

export const librarySteps: readonly Step[] = [libraryV0, libraryV1, libraryV2, libraryV3, libraryV4, libraryV5, libraryV6, libraryV7, libraryV8];
export const authSteps = (accounts: { ofDid(did: Did): AccountId }): readonly Step[] => [authV0, authV1(accounts), authV2];
