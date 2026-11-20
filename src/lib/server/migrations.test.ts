import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createAccounts, type AccountId } from './accounts';
import { createAuthStore } from './auth-store';
import { inviteIsOpen, readerInvite } from './invites';
import { createLibraryStore } from './library-store';
import { migrate, openDatabase } from './migrate';
import { authSteps, librarySteps } from './migrations';
import { createRoles } from './roles';
import { secretBox } from './secret-box';
import { createSharing } from './sharing';

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

// A Library of two readers, as the files before Accounts kept it: keyed by DID.
const second = 'did:plc:second';
function libraryOfTwoReaders(file: string) {
  libraryOfBefore(file);
  const db = new DatabaseSync(file);
  db.exec(`
    insert into record values ('${second}', 'app.atomes.toBuy', '3l2b', '{"isbn":"9782723488525"}', 4, '2026-11-16T10:00:00.000Z', 0);
    insert into record values ('${second}', 'app.atomes.toBuy', '3l2c', null, 5, '2026-11-16T10:00:00.000Z', 1);
    insert into shared_category values ('${second}', 'follows');
    insert into private_work values ('${second}', 'wd:Q2');
  `);
  db.close();
}

const noPds = { repoOf: () => Promise.resolve(undefined) };

describe('library.sqlite made before Accounts', () => {
  test('each DID that owns rows gets one Account, with the same records under the same keys', async () => {
    const file = join(dir, 'library.sqlite');
    libraryOfTwoReaders(file);

    const db = openDatabase(file, librarySteps);
    const accounts = createAccounts(db);
    const first = accounts.ofDid(did);
    const next = accounts.ofDid(second);

    expect(first).not.toBe(next);
    expect(first.startsWith('did:')).toBe(false);
    expect(accounts.identitiesOf(first)).toEqual({ did });
    expect(accounts.identitiesOf(next)).toEqual({ did: second });

    const store = createLibraryStore(db);
    expect(store.list(first, 'app.atomes.toBuy')).toEqual([{ rkey: '3l2a', value: { isbn: '9782723478991' } }]);
    expect(store.list(next, 'app.atomes.toBuy')).toEqual([{ rkey: '3l2b', value: { isbn: '9782723488525' } }]);
    // The tombstone and the rev move too: a device that synced goes on from its rev.
    expect(store.changesSince(next, 4)).toMatchObject({ rev: 5, all: false, deleted: [{ collection: 'app.atomes.toBuy', rkey: '3l2c' }] });
    // Nothing is left under the DID.
    expect(store.list(did as unknown as AccountId, 'app.atomes.toBuy')).toEqual([]);

    const sharing = createSharing({ db: openDatabase(file, librarySteps), library: store, access: noPds, didOf: () => undefined });
    expect(await sharing.state(first)).toMatchObject({ shared: { labels: true, follows: false }, privateWorks: ['wd:Q1'], pending: true });
    expect(await sharing.state(next)).toMatchObject({ shared: { labels: false, follows: true }, privateWorks: ['wd:Q2'], pending: false });
    sharing.close();
    store.close();
  });

  test('an auth.sqlite keeps its browser sessions, now for the Account of their DID', () => {
    const library = join(dir, 'library.sqlite');
    libraryOfBefore(library);
    const accounts = createAccounts(openDatabase(library, librarySteps));
    const file = join(dir, 'auth.sqlite');
    authOfBefore(file);

    const db = openDatabase(file, authSteps(accounts));

    const store = createAuthStore({ db, box: secretBox(Buffer.alloc(32)) });
    expect(store.hasBrowserSessions(accounts.ofDid(did))).toBe(true);
    store.close();
    accounts.close();
  });

  test('a new file gets every table, and opening it again changes nothing', () => {
    const file = join(dir, 'library.sqlite');
    const db = openDatabase(file, librarySteps);
    const account = createAccounts(db).ofDid(did);
    createLibraryStore(db).put(account, 'app.atomes.toBuy', '3l2a', { isbn: '9782723478991' });
    db.close();

    const again = openDatabase(file, librarySteps);
    expect(version(again)).toBe(librarySteps.length);
    expect(counts(again, ['account', 'identity', 'record', 'shared_category'])).toEqual([1, 1, 1, 0]);
    expect(createAccounts(again).ofDid(did)).toBe(account);
    again.close();
  });
});

describe('library.sqlite made before readers made Invites', () => {
  test('an owner Invite made before keeps working, made by nobody', () => {
    const file = join(dir, 'library.sqlite');
    const before = openDatabase(file, librarySteps.slice(0, 3));
    // As scripts/invite.ts made it then: no `made_by` column yet.
    const token = 'A'.repeat(43);
    before.prepare('insert into invite (token_hash, expires_at) values (?, ?)').run(createHash('sha256').update(token).digest('hex'), Date.now() + 3600_000);
    before.close();

    const after = openDatabase(file, librarySteps);
    expect(version(after)).toBe(librarySteps.length);
    expect(inviteIsOpen(after, token)).toBe(true);
    expect(after.prepare('select made_by as madeBy from invite').all()).toEqual([{ madeBy: null }]);
    after.close();
  });
});

describe('library.sqlite made before the Admin role', () => {
  test('its Accounts stay, with no role, and a role can be granted', () => {
    const file = join(dir, 'library.sqlite');
    const before = openDatabase(file, librarySteps.slice(0, 4));
    const account = createAccounts(before).ofDid(did);

    const after = openDatabase(file, librarySteps);
    expect(version(after)).toBe(librarySteps.length);
    const roles = createRoles(after);
    expect(roles.admins()).toEqual([]);
    expect(roles.grant(account, null)).toBe(true);
    expect(roles.rolesOf(account)).toEqual(['admin']);
    after.close();
  });
});

describe('library.sqlite made before an Invite kept its origin', () => {
  test('an Invite with a maker becomes a reader Invite, the others script Invites, and each keeps working', () => {
    const file = join(dir, 'library.sqlite');
    const before = openDatabase(file, librarySteps.slice(0, 7));
    const reader = createAccounts(before).ofDid(did);
    // As the code of before made them: no origin column yet.
    const insert = before.prepare('insert into invite (token_hash, expires_at, made_by) values (?, ?, ?)');
    const ofScript = 'A'.repeat(43);
    const ofReader = 'B'.repeat(43);
    insert.run(createHash('sha256').update(ofScript).digest('hex'), Date.now() + 3600_000, null);
    insert.run(createHash('sha256').update(ofReader).digest('hex'), Date.now() + 3600_000, reader);
    before.close();

    const after = openDatabase(file, librarySteps);
    expect(version(after)).toBe(librarySteps.length);
    expect(after.prepare('select origin, label from invite order by origin').all()).toEqual([
      { origin: 'reader', label: null },
      { origin: 'script', label: null },
    ]);
    expect(inviteIsOpen(after, ofReader)).toBe(true);
    expect(inviteIsOpen(after, ofScript)).toBe(true);
    expect(readerInvite(after, reader).state).toBe('open');
    after.close();
  });
});

describe('library.sqlite made before the last active day', () => {
  test('each Account gets the day of its last Library write, and none with no write', () => {
    const file = join(dir, 'library.sqlite');
    const before = openDatabase(file, librarySteps.slice(0, 6));
    const accounts = createAccounts(before);
    const writer = accounts.ofDid(did);
    const idle = accounts.ofDid(second);
    const insert = before.prepare("insert into record (account, collection, rkey, value, rev, updated_at, deleted) values (?, 'app.atomes.toBuy', ?, '{}', ?, ?, 0)");
    insert.run(writer, 'a', 1, '2026-10-02T23:30:00.000Z');
    insert.run(writer, 'b', 2, '2026-11-05T08:00:00.000Z');
    before.close();

    const after = openDatabase(file, librarySteps);
    const day = (account: string) => (after.prepare('select last_active_day as day from account where id = ?').get(account) as { day: string | null }).day;
    expect(version(after)).toBe(librarySteps.length);
    expect(day(writer)).toBe('2026-11-05');
    expect(day(idle)).toBeNull();
    after.close();
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
