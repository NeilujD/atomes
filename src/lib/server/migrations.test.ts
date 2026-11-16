import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createAuthStore } from './auth-store';
import { createLibraryStore } from './library-store';
import { migrate, openDatabase } from './migrate';
import { authSteps, librarySteps } from './migrations';
import { secretBox } from './secret-box';

const did = 'did:plc:owner';
const version = (db: DatabaseSync) => (db.prepare('pragma user_version').get() as { user_version: number }).user_version;

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atomes-migrations-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// The files as the code before versioned migrations made them: the tables of
// the Library store, the sharing store and the auth store, user_version 0.
function libraryOfBefore(file: string) {
  const db = new DatabaseSync(file);
  db.exec(`
    create table record (
      did text not null, collection text not null, rkey text not null, value text,
      rev integer not null, updated_at text not null, deleted integer not null default 0,
      primary key (did, collection, rkey)
    );
    create index record_rev on record (did, rev);
    create table purged (did text primary key, rev integer not null);
    create table shared_category (did text not null, category text not null, primary key (did, category));
    create table private_work (did text not null, work text not null, primary key (did, work));
    create table sharing_pending (did text primary key);
    insert into record values ('${did}', 'app.atomes.toBuy', '3l2a', '{"isbn":"9782723478991"}', 1, '2026-11-16T10:00:00.000Z', 0);
    insert into purged values ('${did}', 0);
    insert into shared_category values ('${did}', 'labels');
    insert into private_work values ('${did}', 'wd:Q1');
    insert into sharing_pending values ('${did}');
  `);
  db.close();
}

function authOfBefore(file: string) {
  const db = new DatabaseSync(file);
  db.exec(`
    create table oauth_state (key text primary key, sealed text not null, created_at integer not null);
    create table oauth_session (did text primary key, sealed text not null, updated_at integer not null);
    create table browser_session (token_hash text primary key, did text not null, handle text not null, expires_at integer not null);
    create index browser_session_did on browser_session (did);
    insert into browser_session values ('hash', '${did}', 'owner.test', ${Date.now() + 3600_000});
  `);
  db.close();
}

const counts = (db: DatabaseSync, tables: string[]) =>
  tables.map((table) => (db.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n);

describe('library.sqlite and auth.sqlite made before versioned migrations', () => {
  test('a library.sqlite opens with its rows intact and user_version 1', () => {
    const file = join(dir, 'library.sqlite');
    libraryOfBefore(file);

    const db = openDatabase(file, librarySteps);

    expect(version(db)).toBe(1);
    expect(counts(db, ['record', 'purged', 'shared_category', 'private_work', 'sharing_pending'])).toEqual([1, 1, 1, 1, 1]);
    const store = createLibraryStore(db);
    expect(store.get(did, 'app.atomes.toBuy', '3l2a')).toEqual({ isbn: '9782723478991' });
    store.close();
  });

  test('an auth.sqlite opens with its rows intact and user_version 1', () => {
    const file = join(dir, 'auth.sqlite');
    authOfBefore(file);

    const db = openDatabase(file, authSteps);

    expect(version(db)).toBe(1);
    const store = createAuthStore({ db, box: secretBox(Buffer.alloc(32)), allowedDids: new Set([did]) });
    expect(store.hasBrowserSessions(did)).toBe(true);
    store.close();
  });

  test('a new file gets every table, and opening it again changes nothing', () => {
    const file = join(dir, 'library.sqlite');
    const store = createLibraryStore(openDatabase(file, librarySteps));
    store.put(did, 'app.atomes.toBuy', '3l2a', { isbn: '9782723478991' });
    store.close();

    const again = openDatabase(file, librarySteps);
    expect(version(again)).toBe(1);
    expect(counts(again, ['record', 'shared_category', 'private_work', 'sharing_pending'])).toEqual([1, 0, 0, 0]);
    again.close();
  });
});

describe('migrate', () => {
  test('a failed step rolls back and leaves user_version at the last step that ran', () => {
    const db = new DatabaseSync(':memory:');
    const steps = [
      (db: DatabaseSync) => db.exec('create table thing (id integer primary key)'),
      (db: DatabaseSync) => {
        db.exec('insert into thing default values; create table other (id integer)');
        throw new Error('step failed');
      },
    ];

    expect(() => migrate(db, steps)).toThrow('step failed');

    expect(version(db)).toBe(1);
    expect(counts(db, ['thing'])).toEqual([0]);
    expect(db.prepare("select name from sqlite_master where name = 'other'").get()).toBeUndefined();
    db.close();
  });
});
