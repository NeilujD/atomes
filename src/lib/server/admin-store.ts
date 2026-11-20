// What the admin panel reads in `library.sqlite` (ADR 0020), apart from the
// role and the Invite stores: the Admin Log and the Account References.
import type { DatabaseSync } from 'node:sqlite';
import { accountReferences } from './account-reference';
import type { AccountFacts, Start, Totals } from './admin-accounts';
import { readLog, writeLog, type LogLine } from './admin-log';

// What `library.sqlite` knows of an Account; the Catalog and the auth store give the rest.
export type LibraryFacts = Omit<AccountFacts, 'corrections' | 'corrections7d' | 'sessions'>;

export interface AdminStore {
  // Newest first.
  log(): LogLine[];
  write(line: Omit<LogLine, 'at'>, now?: number): void;
  // The Account Reference of every Account of the instance and of every
  // Account the Admin Log names, deleted ones too (8 characters on a collision).
  references(): Map<string, string>;
  // One entry for each Account. Grouped queries, one for each fact, never one
  // for each Account; a record is counted and never read.
  accountFacts(now?: number): LibraryFacts[];
  inviteTotals(now?: number): Totals['invites'];
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
    accountFacts(now = Date.now()) {
      const since = (days: number) => new Date(now - days * 24 * 3600 * 1000).toISOString();
      const all = <T>(sql: string, ...values: string[]) => db.prepare(sql).all(...values) as T[];
      const by = <T extends { account: string }>(rows: T[]) => new Map(rows.map((row) => [row.account, row]));

      const identities = by(all<{ account: string; kinds: string }>('select account, group_concat(kind) as kinds from identity group by account'));
      const records = by(
        all<{ account: string; records: number; changed7d: number; changed24h: number }>(
          `select account, sum(deleted = 0) as records, sum(updated_at >= ?) as changed7d, sum(updated_at >= ?) as changed24h
           from record group by account`,
          since(7),
          since(1),
        ),
      );
      const made = by(
        all<{ account: string; made: number; used: number }>(
          'select made_by as account, count(*) as made, count(used_at) as used from invite where made_by is not null group by made_by',
        ),
      );
      const starts = by(all<{ account: string; madeBy: string | null }>('select used_by as account, made_by as madeBy from invite where used_by is not null'));
      const startOf = (account: string): Start => {
        const invite = starts.get(account);
        return invite?.madeBy ? { kind: 'reader-invite', by: invite.madeBy } : { kind: 'script' };
      };

      return all<{ id: string; createdAt: string; lastActiveDay: string | null }>(
        'select id, created_at as createdAt, last_active_day as lastActiveDay from account',
      ).map(({ id, createdAt, lastActiveDay }) => {
        const kinds = identities.get(id)?.kinds.split(',') ?? [];
        return {
          account: id,
          createdAt: Date.parse(createdAt),
          lastActiveDay,
          start: startOf(id),
          email: kinds.includes('email'),
          atproto: kinds.includes('did'),
          records: records.get(id)?.records ?? 0,
          changed7d: records.get(id)?.changed7d ?? 0,
          changed24h: records.get(id)?.changed24h ?? 0,
          invitesMade: made.get(id)?.made ?? 0,
          invitesUsed: made.get(id)?.used ?? 0,
        };
      });
    },
    inviteTotals(now = Date.now()) {
      return db
        .prepare(
          `select count(used_at) as used,
             coalesce(sum(used_at is null and expires_at > ?), 0) as open,
             coalesce(sum(used_at is null and expires_at <= ?), 0) as expired
           from invite`,
        )
        .get(now, now) as unknown as Totals['invites'];
    },
  };
}
