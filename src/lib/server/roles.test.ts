// The Admin role (ADR 0020, CORE-166): `can()`, and the role command of
// scripts/role.ts on a temporary library.sqlite.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createAccounts, type Accounts } from './accounts';
import { openDatabase } from './migrate';
import { librarySteps } from './migrations';
import { can, createRoles, permissions, roleCommand } from './roles';

describe('can', () => {
  test('an Admin has every permission of the list', () => {
    for (const permission of permissions) expect(can(['admin'], permission)).toBe(true);
  });

  test('an Account with no role has none', () => {
    for (const permission of permissions) expect(can([], permission)).toBe(false);
  });
});

describe('the role command', () => {
  let dir: string;
  let db: DatabaseSync;
  let accounts: Accounts;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'atomes-roles-'));
    db = openDatabase(join(dir, 'library.sqlite'), librarySteps);
    accounts = createAccounts(openDatabase(join(dir, 'library.sqlite'), librarySteps));
  });
  afterEach(() => {
    accounts.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const accountCount = () => (db.prepare('select count(*) as n from account').get() as { n: number }).n;

  test('grant by email address gives the role to the Account of the address, typed in any case', () => {
    const alice = accounts.ofEmail('alice@example.org');

    const outcome = roleCommand(db, 'grant', '  Alice@Example.org ');

    expect(outcome.ok).toBe(true);
    expect(createRoles(db).rolesOf(alice)).toEqual(['admin']);
  });

  test('grant by DID gives the role to the Account of the DID, with no Admin as its maker', () => {
    const bob = accounts.ofDid('did:plc:bob');

    expect(roleCommand(db, 'grant', 'did:plc:bob').ok).toBe(true);

    expect(createRoles(db).admins()).toEqual([{ account: bob, grantedBy: null, grantedAt: expect.any(Number) as number }]);
  });

  test('a grant to an Admin changes nothing', () => {
    const alice = accounts.ofEmail('alice@example.org');
    roleCommand(db, 'grant', 'alice@example.org');

    expect(roleCommand(db, 'grant', 'alice@example.org').ok).toBe(true);

    expect(createRoles(db).admins().map(({ account }) => account)).toEqual([alice]);
  });

  test('an identity with no Account is refused, and no Account is made', () => {
    const before = accountCount();

    expect(roleCommand(db, 'grant', 'nobody@example.org').ok).toBe(false);
    expect(roleCommand(db, 'grant', 'did:plc:nobody').ok).toBe(false);
    expect(roleCommand(db, 'revoke', 'nobody@example.org').ok).toBe(false);

    expect(accountCount()).toBe(before);
    expect(createRoles(db).admins()).toEqual([]);
  });

  test('revoke removes the role; the last Admin too, with a warning', () => {
    const alice = accounts.ofEmail('alice@example.org');
    const bob = accounts.ofDid('did:plc:bob');
    roleCommand(db, 'grant', 'alice@example.org');
    roleCommand(db, 'grant', 'did:plc:bob');

    const first = roleCommand(db, 'revoke', 'alice@example.org');
    expect(first).toMatchObject({ ok: true, warning: undefined });
    expect(createRoles(db).rolesOf(alice)).toEqual([]);

    const last = roleCommand(db, 'revoke', 'did:plc:bob');
    expect(last.ok).toBe(true);
    expect(last.warning).toBeDefined();
    expect(createRoles(db).rolesOf(bob)).toEqual([]);
  });

  test('list names each Admin by email address, else by DID', () => {
    accounts.ofEmail('alice@example.org');
    accounts.ofDid('did:plc:bob');
    accounts.ofEmail('carol@example.org');
    roleCommand(db, 'grant', 'alice@example.org');
    roleCommand(db, 'grant', 'did:plc:bob');

    const { ok, lines } = roleCommand(db, 'list');

    expect(ok).toBe(true);
    expect(lines.join('\n')).toContain('alice@example.org');
    expect(lines.join('\n')).toContain('did:plc:bob');
    expect(lines.join('\n')).not.toContain('carol@example.org');
  });

  test('a library.sqlite with no role table is refused: start the server once', () => {
    const old = openDatabase(join(dir, 'old.sqlite'), librarySteps.slice(0, 4));

    const outcome = roleCommand(old, 'list');

    expect(outcome.ok).toBe(false);
    expect(outcome.lines.join(' ')).toContain('start the server once');
    old.close();
  });

  test('a grant and a revoke by the script each write one Admin Log line with no Admin', () => {
    const alice = accounts.ofEmail('alice@example.org');

    roleCommand(db, 'grant', 'alice@example.org');
    roleCommand(db, 'grant', 'alice@example.org');
    roleCommand(db, 'revoke', 'alice@example.org');

    expect(db.prepare('select admin, action, target, detail from admin_action order by id').all()).toEqual([
      { admin: null, action: 'role.grant', target: alice, detail: null },
      { admin: null, action: 'role.revoke', target: alice, detail: null },
    ]);
  });

  test('the delete of an Admin Account removes its role', () => {
    const alice = accounts.ofEmail('alice@example.org');
    roleCommand(db, 'grant', 'alice@example.org');

    accounts.forget(alice);

    expect(createRoles(db).admins()).toEqual([]);
  });

  test('an unknown command or a missing identity is refused', () => {
    expect(roleCommand(db, 'promote', 'alice@example.org').ok).toBe(false);
    expect(roleCommand(db, 'grant').ok).toBe(false);
  });
});
