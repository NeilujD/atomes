// Sign-in Codes (ADR 0016, "Sign-in"): 6 digits from a secure random source,
// valid for 10 minutes, one use, 5 attempts. `auth.sqlite` keeps the address
// only as its SHA-256 hash and the code only as a hash with that address. A
// new code replaces the last one of the address. The limits of the sign-in
// routes live here too, so a restart does not reset them.
//
// Each check is one SQL statement, so two requests at the same time cannot
// both pass, and no secret is compared in code.
import { createHash, randomInt } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export const codeLifetimeMs = 10 * 60 * 1000;
export const codeAttempts = 5;

export interface SignInCodes {
  // A new code for the address; the last one of the address and scope stops
  // working. `scope`: a code for another use than sign-in (linking an address
  // in Settings, link-email.ts) works only with the same scope, and the
  // sign-in code of the address stays valid.
  issue(address: string, scope?: string): string;
  // True once for the right code, while it is valid and has attempts left. A
  // wrong code uses up one attempt.
  check(address: string, code: string, scope?: string): boolean;
  // Counts one hit on `key`: false past `max` hits in the window of `windowMs`.
  allow(key: string, max: number, windowMs: number): boolean;
  close(): void;
}

// Trimmed and lower-cased, or undefined when it is not an address.
export function normalEmail(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const address = input.trim().toLowerCase();
  return address.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? address : undefined;
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
// The key of an address in auth.sqlite: never the address itself.
export const addressHash = (address: string) => sha256(normalEmail(address) ?? address);
const codeHash = (address: string, code: string) => sha256(`${addressHash(address)}:${code}`);
// The key of the code row: the address hash alone for sign-in.
const codeKey = (address: string, scope?: string) => (scope === undefined ? addressHash(address) : sha256(`${scope}:${addressHash(address)}`));

// `db` is an auth.sqlite that has run authSteps (migrations.ts). Closes it.
export function createSignInCodes({ db, now = Date.now }: { db: DatabaseSync; now?: () => number }): SignInCodes {
  return {
    issue(address, scope) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      db.prepare('delete from sign_in_code where expires_at <= ?').run(now());
      db.prepare(
        `insert into sign_in_code (address_hash, code_hash, expires_at, attempts_left) values (?, ?, ?, ?)
         on conflict (address_hash) do update set
           code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts_left = excluded.attempts_left`,
      ).run(codeKey(address, scope), codeHash(address, code), now() + codeLifetimeMs, codeAttempts);
      return code;
    },
    check(address, code, scope) {
      const used = db
        .prepare('delete from sign_in_code where address_hash = ? and code_hash = ? and expires_at > ? and attempts_left > 0')
        .run(codeKey(address, scope), codeHash(address, code), now());
      if (used.changes === 1) return true;
      db.prepare('update sign_in_code set attempts_left = attempts_left - 1 where address_hash = ? and attempts_left > 0').run(
        codeKey(address, scope),
      );
      return false;
    },
    allow(key, max, windowMs) {
      // SET reads the row as it was: a window that ended starts again at 1.
      const { count } = db
        .prepare(
          `insert into sign_in_limit (key, window_start, count) values (?, ?, 1)
           on conflict (key) do update set
             count = case when window_start <= ? then 1 else count + 1 end,
             window_start = case when window_start <= ? then excluded.window_start else window_start end
           returning count`,
        )
        .get(key, now(), now() - windowMs, now() - windowMs) as { count: number };
      return count <= max;
    },
    close: () => db.close(),
  };
}
