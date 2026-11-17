// Invites (ADR 0016, "Who may sign up"): with SIGN_UP=invite, a new Account
// needs one. An Invite works once and for 14 days. `library.sqlite` keeps only
// the SHA-256 hash of its token; a lookup by hash compares no secret in code.
// The owner makes them with `scripts/invite.ts`, with no limit; a reader makes
// them in Settings, with a limit (CORE-134).
// `scripts/invite.ts` runs this file with Node alone (type stripping), so no
// import outside `node:`.
import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export const inviteLifetimeMs = 14 * 24 * 3600 * 1000;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

// `db` is a library.sqlite that has run librarySteps (migrations.ts). Gives the
// token, which only the Invite link holds. `madeBy`: the Account of the reader
// who made it; none for the owner script.
export function makeInvite(db: DatabaseSync, now = Date.now(), madeBy: string | null = null): { token: string; expiresAt: number } {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = now + inviteLifetimeMs;
  db.prepare('insert into invite (token_hash, expires_at, made_by) values (?, ?, ?)').run(hash(token), expiresAt, madeBy);
  return { token, expiresAt };
}

// The Invite of a reader, as Settings shows it. `used` once a person made an
// Account with one: then the reader makes no more, even after that Account is
// deleted (`used_at` stays). An Invite that expired unused does not count.
export type ReaderInvite = { state: 'none' } | { state: 'open'; expiresAt: number } | { state: 'used' };

export function readerInvite(db: DatabaseSync, account: string, now = Date.now()): ReaderInvite {
  if (db.prepare('select 1 from invite where made_by = ? and used_at is not null').get(account)) return { state: 'used' };
  const { expiresAt } = db.prepare('select max(expires_at) as expiresAt from invite where made_by = ? and used_at is null and expires_at > ?').get(account, now) as {
    expiresAt: number | null;
  };
  return expiresAt === null ? { state: 'none' } : { state: 'open', expiresAt };
}

// A new Invite made by the reader `account`, which cancels their open one;
// undefined when they have used their Invite. Check, cancel and insert hold
// the file in one transaction: a sign-up with the open Invite cannot come
// between them, so a reader never gets two used Invites.
export function makeReaderInvite(db: DatabaseSync, account: string, now = Date.now()): { token: string; expiresAt: number } | undefined {
  db.exec('begin immediate');
  try {
    let made: { token: string; expiresAt: number } | undefined;
    if (readerInvite(db, account, now).state !== 'used') {
      db.prepare('delete from invite where made_by = ? and used_at is null').run(account);
      made = makeInvite(db, now, account);
    }
    db.exec('commit');
    return made;
  } catch (error) {
    db.exec('rollback');
    throw error;
  }
}

// Not used and not expired. `used_at` says used: `used_by` goes back to null
// when the Account is deleted (CORE-55), and the Invite stays used.
export function inviteIsOpen(db: DatabaseSync, token: string, now = Date.now()): boolean {
  return db.prepare('select 1 from invite where token_hash = ? and used_at is null and expires_at > ?').get(hash(token), now) !== undefined;
}

// Uses the Invite up for `account`. One statement: of two sign-ins with one
// Invite, only one gets true.
export function useInvite(db: DatabaseSync, token: string, account: string, now = Date.now()): boolean {
  const { changes } = db
    .prepare('update invite set used_by = ?, used_at = ? where token_hash = ? and used_at is null and expires_at > ?')
    .run(account, now, hash(token), now);
  return changes === 1;
}
