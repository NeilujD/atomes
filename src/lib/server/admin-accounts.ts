// The Accounts part of the admin panel (ADR 0020): pure functions from the
// facts of each Account (admin-store.ts, the Catalog, the auth store) to the
// totals of the instance and to one row for each Account, with its flags. A
// row names an Account by its Account Reference and holds counts and dates
// only: no email address, no handle, no DID, nothing a Library holds.

const dayMs = 24 * 3600 * 1000;

// The limits of the flags: fixed rules, computed when the page opens.
export const flagLimits = {
  // No active day after the sign-up day, this long after sign-up.
  noActivityDays: 14,
  // More records changed in 24 hours than this. A record keeps the time of its
  // last write only, so this counts records, not writes.
  heavyWrites: 1000,
  // More Series Corrections in 7 days than this.
  manyCorrections: 100,
  // More open sessions than this.
  manySessions: 10,
} as const;

export type Flag = 'no-activity' | 'heavy-writes' | 'many-corrections' | 'many-sessions';

// How an Account started. `by`: the Account that made the reader Invite; null once it is deleted.
export type Start =
  | { kind: 'admin-invite'; label: string | null }
  | { kind: 'reader-invite'; by: string | null }
  | { kind: 'added' }
  | { kind: 'script' };

export interface AccountFacts {
  account: string;
  // Sign-up, epoch ms.
  createdAt: number;
  // A calendar day in UTC (YYYY-MM-DD); null when the server never saw the Account.
  lastActiveDay: string | null;
  start: Start;
  email: boolean;
  atproto: boolean;
  records: number;
  changed7d: number;
  changed24h: number;
  invitesMade: number;
  invitesUsed: number;
  corrections: number;
  corrections7d: number;
  sessions: number;
}

export interface AccountRow {
  // The Account ID: a random number, for the actions of the row. Not an identity.
  account: string;
  reference: string;
  flags: Flag[];
  signedUpAt: number;
  lastActiveDay: string | null;
  start: { kind: Start['kind']; label?: string; by?: string };
  signIn: 'email' | 'atproto' | 'both';
  records: number;
  changed7d: number;
  invitesMade: number;
  invitesUsed: number;
  corrections: number;
  sessions: number;
  // The Account References of the Accounts that signed up with a reader Invite of this Account.
  invited: string[];
}

export interface Totals {
  accounts: { total: number; new7d: number; new30d: number; active7d: number; active30d: number };
  invites: { open: number; used: number; expired: number };
  records: number;
}

const dayOf = (at: number) => new Date(at).toISOString().slice(0, 10);

export function flagsOf(facts: AccountFacts, now: number): Flag[] {
  const flags: Flag[] = [];
  const cameBack = facts.lastActiveDay !== null && facts.lastActiveDay > dayOf(facts.createdAt);
  if (!cameBack && now - facts.createdAt >= flagLimits.noActivityDays * dayMs) flags.push('no-activity');
  if (facts.changed24h > flagLimits.heavyWrites) flags.push('heavy-writes');
  if (facts.corrections7d > flagLimits.manyCorrections) flags.push('many-corrections');
  if (facts.sessions > flagLimits.manySessions) flags.push('many-sessions');
  return flags;
}

// Flagged first, then the last active day, newest first; an Account never seen comes last.
export function accountRows(facts: readonly AccountFacts[], references: ReadonlyMap<string, string>, now: number): AccountRow[] {
  const reference = (account: string) => references.get(account) ?? account;
  const invitedBy = new Map<string, string[]>();
  for (const { account, start } of facts) {
    if (start.kind === 'reader-invite' && start.by) invitedBy.set(start.by, [...(invitedBy.get(start.by) ?? []), reference(account)]);
  }
  const rows = facts.map((each): AccountRow => {
    const { start } = each;
    return {
      account: each.account,
      reference: reference(each.account),
      flags: flagsOf(each, now),
      signedUpAt: each.createdAt,
      lastActiveDay: each.lastActiveDay,
      start: {
        kind: start.kind,
        ...(start.kind === 'admin-invite' && start.label ? { label: start.label } : {}),
        ...(start.kind === 'reader-invite' && start.by ? { by: reference(start.by) } : {}),
      },
      signIn: each.email && each.atproto ? 'both' : each.email ? 'email' : 'atproto',
      records: each.records,
      changed7d: each.changed7d,
      invitesMade: each.invitesMade,
      invitesUsed: each.invitesUsed,
      corrections: each.corrections,
      sessions: each.sessions,
      invited: invitedBy.get(each.account) ?? [],
    };
  });
  const flagged = (row: AccountRow) => (row.flags.length > 0 ? 0 : 1);
  return rows.sort(
    (a, b) =>
      flagged(a) - flagged(b) ||
      (b.lastActiveDay ?? '').localeCompare(a.lastActiveDay ?? '') ||
      b.signedUpAt - a.signedUpAt ||
      a.reference.localeCompare(b.reference),
  );
}

export function totalsOf(facts: readonly AccountFacts[], invites: Totals['invites'], now: number): Totals {
  const since = (days: number) => now - days * dayMs;
  const count = (test: (each: AccountFacts) => boolean) => facts.filter(test).length;
  const activeSince = (days: number) => count((each) => each.lastActiveDay !== null && each.lastActiveDay >= dayOf(since(days)));
  return {
    accounts: {
      total: facts.length,
      new7d: count((each) => each.createdAt >= since(7)),
      new30d: count((each) => each.createdAt >= since(30)),
      active7d: activeSince(7),
      active30d: activeSince(30),
    },
    invites,
    records: facts.reduce((sum, each) => sum + each.records, 0),
  };
}
