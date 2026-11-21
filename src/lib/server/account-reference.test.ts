import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { accountReference, accountReferences } from './account-reference';

test('an Account Reference is A- and 6 base32 characters, the same each time, and differs between Accounts', () => {
  const account = randomUUID();

  expect(accountReference(account)).toMatch(/^A-[A-Z2-7]{6}$/);
  expect(accountReference(account)).toBe(accountReference(account));
  expect(accountReference(randomUUID())).not.toBe(accountReference(account));
});

test('it is the first characters of the base32 SHA-256 of the Account ID', () => {
  // SHA-256 of "" starts e3 b0 c4 42 98: base32 "4OYMIQ".
  expect(accountReference('')).toBe('A-4OYMIQ');
});

test('two Accounts with the same 6 characters both show 8; the others keep 6', () => {
  const seen = new Map<string, string>();
  let pair: [string, string] | undefined;
  while (!pair) {
    const account = randomUUID();
    const reference = accountReference(account);
    const other = seen.get(reference);
    if (other) pair = [other, account];
    seen.set(reference, account);
  }
  const lone = randomUUID();

  const references = accountReferences([...pair, lone]);

  expect(references.get(pair[0])).toMatch(/^A-[A-Z2-7]{8}$/);
  expect(references.get(pair[1])).toMatch(/^A-[A-Z2-7]{8}$/);
  expect(references.get(pair[0])).not.toBe(references.get(pair[1]));
  expect(references.get(lone)).toBe(accountReference(lone));
});
