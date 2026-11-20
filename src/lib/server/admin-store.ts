// What the admin panel reads in `library.sqlite` (ADR 0020), apart from the
// role and the Invite stores: the Admin Log and the Account References.
import type { DatabaseSync } from 'node:sqlite';
import { newAccountId } from './accounts';
import { accountReferences } from './account-reference';
import type { AccountFacts, Start, Totals } from './admin-accounts';
import { readLog, writeLog, type LogLine } from './admin-log';
import { inviteLifetimeMs, makeInvite, type InviteOrigin } from './invites';
import { inTransaction } from './migrate';

// An Invite as the Invites part lists it. `id` is the hash of its token: the
// instance keeps no token, so no list can show a link again.
export interface InviteFacts {
  id: string;
  origin: InviteOrigin;
  label: string | null;
  state: 'open' | 'used' | 'expired';
  madeAt: number;
  usedAt: number | null;
  // Account IDs; null for the script, and once the Account is deleted.
  madeBy: string | null;
  usedBy: string | null;
}

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
  // Every Invite of the instance, newest first.
  invites(now?: number): InviteFacts[];
  // `count` Invites of the Admin, each for 14 days, with one Admin Log line,
  // in one transaction. Gives the tokens: the only copy.
  makeInvites(admin: string, count: number, label: string | null, now?: number): { tokens: string[]; expiresAt: number };
  // Removes an open Invite of an Admin or of the script, with one Admin Log
  // line. False for any other Invite: nothing changes.
  revokeInvite(admin: string, id: string, now?: number): boolean;
  // A new Account with this email address (trimmed and lower-cased already)
  // as its identity, with no Invite, and one Admin Log line, in one
  // transaction. Undefined when the address has an Account: nothing changes.
  addAccount(admin: string, email: string, now?: number): string | undefined;
  hasAccount(account: string): boolean;
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
      const starts = by(
        all<{ account: string; origin: InviteOrigin; madeBy: string | null; label: string | null }>(
          'select used_by as account, origin, made_by as madeBy, label from invite where used_by is not null',
        ),
      );
      // An Account with no Invite came from the operator's shell too (a migration, the preview setting).
      const startOf = (account: string): Start => {
        const invite = starts.get(account);
        if (invite?.origin === 'admin') return { kind: 'admin-invite', label: invite.label };
        if (invite?.origin === 'reader') return { kind: 'reader-invite', by: invite.madeBy };
        return { kind: 'script' };
      };

      return all<{ id: string; createdAt: string; lastActiveDay: string | null; added: number }>(
        'select id, created_at as createdAt, last_active_day as lastActiveDay, added_by_admin as added from account',
      ).map(({ id, createdAt, lastActiveDay, added }) => {
        const kinds = identities.get(id)?.kinds.split(',') ?? [];
        return {
          account: id,
          createdAt: Date.parse(createdAt),
          lastActiveDay,
          start: added ? { kind: 'added' } : startOf(id),
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
    invites(now = Date.now()) {
      const rows = db
        .prepare(
          `select token_hash as id, origin, label, expires_at as expiresAt, used_at as usedAt, made_by as madeBy, used_by as usedBy
           from invite order by expires_at desc, rowid desc`,
        )
        .all() as unknown as (Omit<InviteFacts, 'state' | 'madeAt'> & { expiresAt: number })[];
      return rows.map(({ expiresAt, ...invite }) => ({
        ...invite,
        state: invite.usedAt !== null ? 'used' : expiresAt > now ? 'open' : 'expired',
        // An Invite lives 14 days from the moment it is made.
        madeAt: expiresAt - inviteLifetimeMs,
      }));
    },
    makeInvites(admin, count, label, now = Date.now()) {
      return inTransaction(db, () => {
        const made = Array.from({ length: count }, () => makeInvite(db, now, admin, { label }));
        writeLog(db, { admin, action: 'invite.make', target: null, detail: label === null ? String(count) : `${count} · ${label}` }, now);
        return { tokens: made.map(({ token }) => token), expiresAt: made[0].expiresAt };
      });
    },
    hasAccount: (account) => db.prepare('select 1 from account where id = ?').get(account) !== undefined,
    addAccount(admin, email, now = Date.now()) {
      return inTransaction(db, () => {
        if (db.prepare("select 1 from identity where kind = 'email' and value = ?").get(email)) return undefined;
        const account = newAccountId();
        db.prepare('insert into account (id, created_at, added_by_admin) values (?, ?, 1)').run(account, new Date(now).toISOString());
        db.prepare("insert into identity (account, kind, value) values (?, 'email', ?)").run(account, email);
        writeLog(db, { admin, action: 'account.add', target: account, detail: null }, now);
        return account;
      });
    },
    revokeInvite(admin, id, now = Date.now()) {
      return inTransaction(db, () => {
        const revoked = db
          .prepare("delete from invite where token_hash = ? and used_at is null and expires_at > ? and origin in ('admin', 'script') returning label")
          .get(id, now) as { label: string | null } | undefined;
        if (!revoked) return false;
        writeLog(db, { admin, action: 'invite.revoke', target: id, detail: revoked.label }, now);
        return true;
      });
    },
  };
}
