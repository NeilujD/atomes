// Invites (ADR 0016, "Who may sign up"): with SIGN_UP=invite, a new Account
// needs one. An Invite works once and for 14 days. `library.sqlite` keeps only
// the SHA-256 hash of its token; a lookup by hash compares no secret in code.
// `scripts/invite.ts` runs this file with Node alone (type stripping), so no
// import outside `node:`.
import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export const inviteLifetimeMs = 14 * 24 * 3600 * 1000;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

// `db` is a library.sqlite that has run librarySteps (migrations.ts). Gives the
// token, which only the Invite link holds.
export function makeInvite(db: DatabaseSync, now = Date.now()): { token: string; expiresAt: number } {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = now + inviteLifetimeMs;
  db.prepare('insert into invite (token_hash, expires_at) values (?, ?)').run(hash(token), expiresAt);
  return { token, expiresAt };
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
