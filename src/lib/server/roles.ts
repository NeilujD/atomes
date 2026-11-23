// The Admin role (ADR 0020): a row in `account_role` of `library.sqlite`, and
// one function, `can()`, that answers every check from a fixed list of
// permissions. `admin` is the only role and has every permission.
// `scripts/role.ts` runs this file with Node alone (type stripping), so no
// import outside `node:` and relative `.ts` files that follow the same rule.
import type { DatabaseSync } from 'node:sqlite';
import { writeLog } from './admin-log.ts';
import { inTransaction } from './migrate.ts';
import { normalEmail } from './sign-in-codes.ts';

export const permissions = [
  'panel.open',
  'accounts.read',
  'accounts.add',
  'accounts.delete',
  'invites.make',
  'invites.revoke',
  'identity.show',
  'roles.grant',
  'roles.revoke',
  'log.read',
] as const;
export type Permission = (typeof permissions)[number];

export type Role = 'admin';

const granted: Record<Role, readonly Permission[]> = { admin: permissions };

export function can(roles: readonly Role[], permission: Permission): boolean {
  return roles.some((role) => granted[role].includes(permission));
}

export interface Grant {
  account: string;
  // The Admin who granted the role; null for scripts/role.ts.
  grantedBy: string | null;
  grantedAt: number;
}

export interface Roles {
  // Read from the table on each call: a revoke works at the next request.
  rolesOf(account: string): Role[];
  // `by`: the Admin who acts; null for the script. Each change writes one
  // line to the Admin Log, in the same transaction. False when the Account
  // had the role already: nothing is written.
  grant(account: string, by: string | null, now?: number): boolean;
  // False when the Account did not have the role.
  revoke(account: string, by: string | null, now?: number): boolean;
  // The Admins, oldest grant first.
  admins(): Grant[];
  // As findAccount.
  accountOf(identity: string): string | undefined;
}

// `db` has run `librarySteps` (migrations.ts). Does not close it.
export function createRoles(db: DatabaseSync): Roles {
  return {
    rolesOf: (account) => (db.prepare('select role from account_role where account = ?').all(account) as { role: Role }[]).map(({ role }) => role),
    grant: (account, by, now = Date.now()) =>
      inTransaction(db, () => {
        const { changes } = db
          .prepare("insert into account_role (account, role, granted_by, granted_at) values (?, 'admin', ?, ?) on conflict do nothing")
          .run(account, by, now);
        if (changes === 1) writeLog(db, { admin: by, action: 'role.grant', target: account, detail: null }, now);
        return changes === 1;
      }),
    revoke: (account, by, now = Date.now()) =>
      inTransaction(db, () => {
        const { changes } = db.prepare("delete from account_role where account = ? and role = 'admin'").run(account);
        if (changes === 1) writeLog(db, { admin: by, action: 'role.revoke', target: account, detail: null }, now);
        return changes === 1;
      }),
    accountOf: (identity) => findAccount(db, identity),
    admins: () =>
      db
        .prepare("select account, granted_by as grantedBy, granted_at as grantedAt from account_role where role = 'admin' order by granted_at, account")
        .all() as unknown as Grant[],
  };
}

// The Account of an email address (trimmed and lower-cased, as for sign-in)
// or of a DID; undefined when no Account has it. Makes none.
export function findAccount(db: DatabaseSync, identity: string): string | undefined {
  const did = identity.trim();
  const [kind, value] = did.startsWith('did:') ? ['did', did] : ['email', normalEmail(identity)];
  if (value === undefined) return undefined;
  return (db.prepare('select account from identity where kind = ? and value = ?').get(kind, value) as { account: string } | undefined)?.account;
}

// How an Admin is named to the operator and to the other Admins: the email
// address, else the DID.
export function identityOf(db: DatabaseSync, account: string): string | undefined {
  const rows = db.prepare('select kind, value from identity where account = ?').all(account) as { kind: string; value: string }[];
  return (rows.find(({ kind }) => kind === 'email') ?? rows.find(({ kind }) => kind === 'did'))?.value;
}

export interface RoleCommandOutcome {
  ok: boolean;
  lines: string[];
  // The instance has no Admin left.
  warning?: string;
}

const usage = 'Usage: scripts/role.ts grant|revoke <email address or DID>, or scripts/role.ts list';

// `scripts/role.ts grant|revoke|list <identity>`. `db` is the library.sqlite
// of the instance, as the server left it.
export function roleCommand(db: DatabaseSync, command: string | undefined, identity?: string, now = Date.now()): RoleCommandOutcome {
  const tables = db.prepare("select count(*) as n from sqlite_master where type = 'table' and name in ('account_role', 'admin_action')").get() as { n: number };
  if (tables.n < 2) {
    return { ok: false, lines: ['This library.sqlite has no role table yet: start the server once, then run this again.'] };
  }
  const roles = createRoles(db);
  if (command === 'list') {
    const admins = roles.admins();
    if (admins.length === 0) return { ok: true, lines: ['No Admin.'] };
    return {
      ok: true,
      lines: admins.map(({ account, grantedAt }) => `${identityOf(db, account) ?? account}  since ${new Date(grantedAt).toISOString().slice(0, 10)}`),
    };
  }
  if ((command !== 'grant' && command !== 'revoke') || !identity) return { ok: false, lines: [usage] };
  const account = findAccount(db, identity);
  if (account === undefined) return { ok: false, lines: [`No Account has ${identity.trim()}: nothing changed.`] };
  if (command === 'grant') {
    return { ok: true, lines: [roles.grant(account, null, now) ? 'Granted the Admin role.' : 'This Account is an Admin already.'] };
  }
  if (!roles.revoke(account, null, now)) return { ok: true, lines: ['This Account is not an Admin: nothing changed.'] };
  const warning = roles.admins().length === 0 ? 'The instance has no Admin now: grant the role again with this script.' : undefined;
  return { ok: true, lines: ['Revoked the Admin role.'], warning };
}
