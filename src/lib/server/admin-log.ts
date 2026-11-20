// The Admin Log (ADR 0020): one line for each admin action, in `library.sqlite`.
// A line keeps a reference to the data (an Account ID, the hash of an Invite
// token), never a copy, and never an email address. No foreign key: a line
// stays when its Account goes. Each write removes the lines older than 12
// months. `scripts/role.ts` writes here too, so no import outside `node:`.
import type { DatabaseSync } from 'node:sqlite';

export type AdminAction =
  | 'role.grant'
  | 'role.revoke'
  // A grant by email address that no Account has: the Admin learned that none has it.
  | 'role.grant-no-account'
  | 'invite.make'
  | 'invite.revoke'
  | 'account.add'
  // A try to add an address that has an Account: the Admin learned that it has one.
  | 'account.add-exists'
  | 'account.delete'
  | 'identity.show'
  | 'identity.find';

export interface LogLine {
  at: number;
  // The Account ID of the Admin; null for the script.
  admin: string | null;
  action: AdminAction;
  // An Account ID, or an Invite token hash for invite.*; null for a search with no match.
  target: string | null;
  // A reason, a label or a count; never an email address.
  detail: string | null;
}

// The day 12 months before `now`, at the same time.
export function keptSince(now: number): number {
  const day = new Date(now);
  day.setUTCFullYear(day.getUTCFullYear() - 1);
  return day.getTime();
}

// `db` has run `librarySteps`. Call inside the transaction of the action, when it has one.
export function writeLog(db: DatabaseSync, line: Omit<LogLine, 'at'>, now = Date.now()): void {
  db.prepare('delete from admin_action where at < ?').run(keptSince(now));
  db.prepare('insert into admin_action (at, admin, action, target, detail) values (?, ?, ?, ?, ?)').run(
    now,
    line.admin,
    line.action,
    line.target,
    line.detail,
  );
}

// Newest first. A line older than 12 months is not read, also when no write has removed it yet.
export function readLog(db: DatabaseSync, now = Date.now()): LogLine[] {
  return db
    .prepare('select at, admin, action, target, detail from admin_action where at >= ? order by at desc, id desc')
    .all(keptSince(now)) as unknown as LogLine[];
}
