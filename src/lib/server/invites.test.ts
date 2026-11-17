import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createAccounts, type AccountId, type Accounts } from './accounts';
import { inviteLifetimeMs, makeInvite, makeReaderInvite, readerInvite, useInvite } from './invites';
import { openDatabase } from './migrate';
import { librarySteps } from './migrations';

// A reader makes an Invite from Settings (CORE-134): one invited Account for
// each reader, one open Invite at a time.
let dir: string;
let db: DatabaseSync;
let accounts: Accounts;
let alice: AccountId;
const now = Date.parse('2026-11-17T10:00:00Z');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atomes-invites-'));
  db = openDatabase(join(dir, 'library.sqlite'), librarySteps);
  accounts = createAccounts(openDatabase(join(dir, 'library.sqlite'), librarySteps));
  alice = accounts.signInEmail('alice@example.org', makeInvite(db).token);
});

afterEach(() => {
  accounts.close();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const signUp = (email: string, token: string) => accounts.signInEmail(email, token);

describe('a reader makes an Invite', () => {
  test('a new reader has none, makes one that works 14 days, and sees it open', () => {
    expect(readerInvite(db, alice, now)).toEqual({ state: 'none' });

    const made = makeReaderInvite(db, alice, now);

    expect(made?.expiresAt).toBe(now + inviteLifetimeMs);
    expect(readerInvite(db, alice, now)).toEqual({ state: 'open', expiresAt: now + inviteLifetimeMs });
    expect(accounts.inviteIsOpen(made!.token)).toBe(true);
  });

  test('a new link cancels the open one', () => {
    const first = makeReaderInvite(db, alice, now)!;
    const second = makeReaderInvite(db, alice, now + 1000)!;

    expect(accounts.inviteIsOpen(first.token)).toBe(false);
    expect(accounts.inviteIsOpen(second.token)).toBe(true);
    expect(readerInvite(db, alice, now + 1000)).toEqual({ state: 'open', expiresAt: now + 1000 + inviteLifetimeMs });
  });

  test('once a person signs up with it, the reader has used their Invite and cannot make another', () => {
    const { token } = makeReaderInvite(db, alice, now)!;
    signUp('bob@example.org', token);

    expect(readerInvite(db, alice)).toEqual({ state: 'used' });
    expect(makeReaderInvite(db, alice)).toBeUndefined();
    expect(db.prepare('select count(*) as n from invite where made_by = ?').get(alice)).toEqual({ n: 1 });
  });

  test('an Invite that expires without use does not count', () => {
    const { token } = makeReaderInvite(db, alice, now)!;
    const later = now + inviteLifetimeMs + 1;

    expect(useInvite(db, token, alice, later)).toBe(false);
    expect(readerInvite(db, alice, later)).toEqual({ state: 'none' });
    expect(makeReaderInvite(db, alice, later)).toBeDefined();
  });

  test('when the invited Account is deleted, the reader does not get their Invite back', () => {
    const bob = signUp('bob@example.org', makeReaderInvite(db, alice)!.token);

    accounts.forget(bob);

    expect(readerInvite(db, alice)).toEqual({ state: 'used' });
    expect(makeReaderInvite(db, alice)).toBeUndefined();
  });

  test('an invited reader can make one Invite too', () => {
    const bob = signUp('bob@example.org', makeReaderInvite(db, alice)!.token);

    signUp('carol@example.org', makeReaderInvite(db, bob)!.token);

    expect(readerInvite(db, bob)).toEqual({ state: 'used' });
  });

  test('the Invite of the owner script counts for no reader', () => {
    signUp('bob@example.org', makeInvite(db).token);

    expect(readerInvite(db, alice)).toEqual({ state: 'none' });
  });

  test('a make while a sign-up holds the file writes nothing beside it', () => {
    const { token } = makeReaderInvite(db, alice, now)!;
    // Another connection is using the Invite up, not committed yet.
    const other = new DatabaseSync(join(dir, 'library.sqlite'), { timeout: 0 });
    other.exec('begin immediate');
    expect(useInvite(other, token, alice, now)).toBe(true);

    expect(() => makeReaderInvite(db, alice, now)).toThrow();
    other.exec('commit');
    other.close();

    expect(makeReaderInvite(db, alice, now)).toBeUndefined();
    expect(db.prepare('select count(*) as n from invite where made_by = ?').get(alice)).toEqual({ n: 1 });
  });
});

describe('a reader who deletes their Account', () => {
  test('leaves no open Invite: nobody signs up with its link', () => {
    const { token } = makeReaderInvite(db, alice)!;

    accounts.forget(alice);

    expect(accounts.inviteIsOpen(token)).toBe(false);
    expect(db.prepare('select count(*) as n from invite where made_by = ?').get(alice)).toEqual({ n: 0 });
  });

  test('keeps their used Invite used, with no maker', () => {
    const { token } = makeReaderInvite(db, alice)!;
    const bob = signUp('bob@example.org', token);

    accounts.forget(alice);

    expect(accounts.inviteIsOpen(token)).toBe(false);
    expect(db.prepare('select made_by as madeBy, used_by as usedBy from invite where used_by = ?').get(bob)).toEqual({ madeBy: null, usedBy: bob });
  });
});
