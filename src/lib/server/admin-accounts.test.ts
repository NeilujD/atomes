// The rows, flags and totals of the Accounts part (ADR 0020, CORE-169): pure functions.
import { expect, test } from 'vitest';
import { accountRows, flagLimits, flagsOf, totalsOf, type AccountFacts } from './admin-accounts';

const dayMs = 24 * 3600 * 1000;
const now = Date.UTC(2026, 10, 20, 12);
const day = (at: number) => new Date(at).toISOString().slice(0, 10);

// An Account that signed up 30 days ago and was active today, with nothing unusual.
const facts = (over: Partial<AccountFacts> = {}): AccountFacts => ({
  account: 'a',
  createdAt: now - 30 * dayMs,
  lastActiveDay: day(now),
  start: { kind: 'script' },
  email: true,
  atproto: false,
  records: 0,
  changed7d: 0,
  changed24h: 0,
  invitesMade: 0,
  invitesUsed: 0,
  corrections: 0,
  corrections7d: 0,
  sessions: 0,
  ...over,
});

test('an Account with usual use has no flag', () => {
  expect(flagsOf(facts(), now)).toEqual([]);
});

test('No activity: no active day after the sign-up day, 14 days after sign-up, and not one moment before', () => {
  const signedUp = now - flagLimits.noActivityDays * dayMs;
  const never = { createdAt: signedUp, lastActiveDay: null };
  const onlyThatDay = { createdAt: signedUp, lastActiveDay: day(signedUp) };

  expect(flagsOf(facts(never), now)).toEqual(['no-activity']);
  expect(flagsOf(facts(onlyThatDay), now)).toEqual(['no-activity']);
  expect(flagsOf(facts({ ...never, createdAt: signedUp + 1 }), now)).toEqual([]);
  // Came back the day after the sign-up.
  expect(flagsOf(facts({ createdAt: signedUp, lastActiveDay: day(signedUp + dayMs) }), now)).toEqual([]);
});

test('Heavy writes: more than 1000 records changed in 24 hours', () => {
  expect(flagsOf(facts({ changed24h: 1000 }), now)).toEqual([]);
  expect(flagsOf(facts({ changed24h: 1001 }), now)).toEqual(['heavy-writes']);
});

test('Many Corrections: more than 100 Series Corrections in 7 days', () => {
  expect(flagsOf(facts({ corrections: 5000, corrections7d: 100 }), now)).toEqual([]);
  expect(flagsOf(facts({ corrections7d: 101 }), now)).toEqual(['many-corrections']);
});

test('Many sessions: more than 10 open sessions', () => {
  expect(flagsOf(facts({ sessions: 10 }), now)).toEqual([]);
  expect(flagsOf(facts({ sessions: 11 }), now)).toEqual(['many-sessions']);
});

test('rows: flagged first, then the last active day, newest first, an Account never seen last', () => {
  const references = new Map([
    ['quiet-old', 'A-OLD'],
    ['quiet-new', 'A-NEW'],
    ['flagged', 'A-FLAG'],
    ['never', 'A-NEVER'],
  ]);
  const rows = accountRows(
    [
      facts({ account: 'quiet-old', lastActiveDay: day(now - 5 * dayMs) }),
      facts({ account: 'never', createdAt: now - dayMs, lastActiveDay: null }),
      facts({ account: 'quiet-new' }),
      facts({ account: 'flagged', lastActiveDay: day(now - 9 * dayMs), sessions: 11 }),
    ],
    references,
    now,
  );

  expect(rows.map(({ reference }) => reference)).toEqual(['A-FLAG', 'A-NEW', 'A-OLD', 'A-NEVER']);
});

test('a row names the maker of its reader Invite by Account Reference, and gives the sign-in ways', () => {
  const references = new Map([
    ['a', 'A-AAAAAA'],
    ['maker', 'A-MAKER2'],
  ]);
  const [row] = accountRows([facts({ start: { kind: 'reader-invite', by: 'maker' }, email: true, atproto: true })], references, now);

  expect(row.start).toEqual({ kind: 'reader-invite', by: 'A-MAKER2' });
  expect(row.signIn).toBe('both');
  expect(accountRows([facts({ start: { kind: 'admin-invite', label: 'Book club' }, email: false, atproto: true })], references, now)[0]).toMatchObject({
    start: { kind: 'admin-invite', label: 'Book club' },
    signIn: 'atproto',
  });
});

test('totals: Accounts in total, new and active in 7 and 30 days, and the records', () => {
  const totals = totalsOf(
    [
      facts({ createdAt: now - 3 * dayMs, records: 10 }),
      facts({ createdAt: now - 20 * dayMs, lastActiveDay: day(now - 10 * dayMs), records: 5 }),
      facts({ createdAt: now - 90 * dayMs, lastActiveDay: null }),
    ],
    { open: 1, used: 2, expired: 3 },
    now,
  );

  expect(totals).toEqual({
    accounts: { total: 3, new7d: 1, new30d: 2, active7d: 1, active30d: 2 },
    invites: { open: 1, used: 2, expired: 3 },
    records: 15,
  });
});
