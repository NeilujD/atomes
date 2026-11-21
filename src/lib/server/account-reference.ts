// The Account Reference (ADR 0020, GLOSSARY.md): the short code that names an
// Account in the admin panel, in place of its identity. `A-` and the first 6
// characters of the base32 form (RFC 4648) of the SHA-256 of the Account ID;
// when two Accounts share one, both show 8 characters. Not a secret: it only
// keeps identity off the screen.
import { createHash } from 'node:crypto';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32(bytes: Uint8Array): string {
  let text = '';
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      text += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  return bits > 0 ? text + alphabet[(value << (5 - bits)) & 31] : text;
}

const code = (account: string, length: number) => `A-${base32(createHash('sha256').update(account).digest()).slice(0, length)}`;

export function accountReference(account: string): string {
  return code(account, 6);
}

// The References of every Account the panel shows at once: 8 characters for
// the Accounts whose 6 collide.
export function accountReferences(accounts: Iterable<string>): Map<string, string> {
  const unique = [...new Set(accounts)];
  const counts = new Map<string, number>();
  for (const account of unique) counts.set(code(account, 6), (counts.get(code(account, 6)) ?? 0) + 1);
  return new Map(unique.map((account) => [account, code(account, (counts.get(code(account, 6)) ?? 0) > 1 ? 8 : 6)]));
}
