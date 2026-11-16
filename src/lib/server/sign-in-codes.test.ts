import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { openDatabase } from './migrate';
import { authSteps } from './migrations';
import { codeAttempts, codeLifetimeMs, createSignInCodes, normalEmail, type SignInCodes } from './sign-in-codes';

const noAccounts = { ofDid: () => 'unused' as never };
const address = 'reader@example.org';

let dir: string;
let file: string;
let clock: number;
let codes: SignInCodes;
const opened: SignInCodes[] = [];

// Each call is a new connection to the same auth.sqlite: a restarted server,
// or a second request at the same time.
function open(): SignInCodes {
  const store = createSignInCodes({ db: openDatabase(file, authSteps(noAccounts)), now: () => clock });
  opened.push(store);
  return store;
}

const wrongOf = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atomes-codes-'));
  file = join(dir, 'auth.sqlite');
  clock = 1_800_000_000_000;
  codes = open();
});

afterEach(() => {
  for (const store of opened.splice(0)) store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('normalEmail', () => {
  test('trims and lower-cases an address', () => {
    expect(normalEmail('  Reader@Example.ORG ')).toBe('reader@example.org');
  });

  test.each([[''], ['reader'], ['reader@'], ['@example.org'], ['a b@example.org'], [42], [undefined], [`${'a'.repeat(250)}@example.org`]])(
    'refuses %j',
    (value) => {
      expect(normalEmail(value)).toBeUndefined();
    },
  );
});

describe('Sign-in Codes', () => {
  test('a code has 6 digits and works once', () => {
    const code = codes.issue(address);

    expect(code).toMatch(/^\d{6}$/);
    expect(codes.check(address, code)).toBe(true);
    expect(codes.check(address, code)).toBe(false);
  });

  test('the address is compared trimmed and lower-cased', () => {
    const code = codes.issue(' Reader@Example.org');

    expect(codes.check('READER@example.org ', code)).toBe(true);
  });

  test('auth.sqlite keeps neither the code nor the address', () => {
    const code = codes.issue(address);
    const db = openDatabase(file, authSteps(noAccounts));
    try {
      const rows = JSON.stringify(db.prepare('select * from sign_in_code').all());
      expect(rows).not.toContain(code);
      expect(rows).not.toContain('reader');
    } finally {
      db.close();
    }
  });

  test('a code of another address does not work', () => {
    const code = codes.issue(address);

    expect(codes.check('other@example.org', code)).toBe(false);
  });

  test('a code is refused after 10 minutes', () => {
    const code = codes.issue(address);
    clock += codeLifetimeMs;

    expect(codes.check(address, code)).toBe(false);
  });

  test('5 wrong codes kill the code: the right one is refused after that', () => {
    const code = codes.issue(address);
    for (let i = 0; i < codeAttempts; i++) expect(codes.check(address, wrongOf(code))).toBe(false);

    expect(codes.check(address, code)).toBe(false);
  });

  test('4 wrong codes leave the right one working', () => {
    const code = codes.issue(address);
    for (let i = 0; i < codeAttempts - 1; i++) codes.check(address, wrongOf(code));

    expect(codes.check(address, code)).toBe(true);
  });

  test('a new code replaces the last one of the address, with all its attempts', () => {
    const first = codes.issue(address);
    for (let i = 0; i < codeAttempts - 1; i++) codes.check(address, wrongOf(first));
    let second = codes.issue(address);
    // A random code may come twice in a row.
    while (second === first) second = codes.issue(address);

    expect(codes.check(address, first)).toBe(false);
    expect(codes.check(address, second)).toBe(true);
  });

  test('race: two checks of the same code on two connections, only one passes', () => {
    const code = codes.issue(address);
    const other = open();

    expect([codes.check(address, code), other.check(address, code)].filter(Boolean)).toHaveLength(1);
  });

  test('the attempts hold after a restart', () => {
    const code = codes.issue(address);
    for (let i = 0; i < codeAttempts; i++) codes.check(address, wrongOf(code));
    codes.close();
    opened.splice(opened.indexOf(codes), 1);

    expect(open().check(address, code)).toBe(false);
  });
});

describe('limits', () => {
  test('a key is allowed `max` times in its window, then refused until the window ends', () => {
    const results = Array.from({ length: 4 }, () => codes.allow('send:ip:203.0.113.9', 3, 60_000));
    expect(results).toEqual([true, true, true, false]);

    clock += 60_000;
    expect(codes.allow('send:ip:203.0.113.9', 3, 60_000)).toBe(true);
  });

  test('keys count apart', () => {
    codes.allow('a', 1, 60_000);

    expect(codes.allow('b', 1, 60_000)).toBe(true);
    expect(codes.allow('a', 1, 60_000)).toBe(false);
  });

  test('the limits hold after a restart', () => {
    codes.allow('send:ip:203.0.113.9', 1, 60_000);
    codes.close();
    opened.splice(opened.indexOf(codes), 1);

    expect(open().allow('send:ip:203.0.113.9', 1, 60_000)).toBe(false);
  });
});
