// What the admin panel reads in `library.sqlite` (ADR 0020), apart from the
// role and the Invite stores: the Admin Log and the Account References.
import type { DatabaseSync } from 'node:sqlite';
import { accountReferences } from './account-reference';
import { readLog, writeLog, type LogLine } from './admin-log';

export interface AdminStore {
  // Newest first.
  log(): LogLine[];
  write(line: Omit<LogLine, 'at'>, now?: number): void;
  // The Account Reference of every Account of the instance and of every
  // Account the Admin Log names, deleted ones too (8 characters on a collision).
  references(): Map<string, string>;
}

// `db` has run `librarySteps`. Does not close it.
export function createAdminStore(db: DatabaseSync): AdminStore {
  return {
    log: () => readLog(db),
    write: (line, now) => writeLog(db, line, now),
    references() {
      const rows = db
        .prepare(
          `select id from account
           union select admin from admin_action where admin is not null
           union select target from admin_action where target is not null and action not like 'invite.%'`,
        )
        .all() as { id: string }[];
      return accountReferences(rows.map(({ id }) => id));
    },
  };
}
