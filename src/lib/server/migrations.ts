// The schemas of `library.sqlite` and `auth.sqlite`, one step per change
// (migrate.ts). `library.sqlite` is backed up and holds the readers' records
// (ADR 0016), so a step must keep every row: add a step at the end of a list;
// never edit or remove one. instance.ts runs them once, before any store opens.
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

export const librarySteps: readonly Step[] = [libraryV0];
export const authSteps: readonly Step[] = [authV0];
