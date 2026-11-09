// Encrypts what the instance keeps for a sign-in (OAuth tokens, DPoP keys) with
// SESSION_ENCRYPTION_KEY, so a copy of the SQLite file alone gives no token (ADR 0013).
// AES-256-GCM: a value changed on disk fails to open instead of being used.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface SecretBox {
  seal(value: unknown): string;
  open(sealed: string): unknown;
}

const ivBytes = 12;
const tagBytes = 16;

export function secretBox(key: Buffer): SecretBox {
  if (key.length !== 32) throw new Error('The session key must be 32 bytes');
  return {
    seal(value) {
      const iv = randomBytes(ivBytes);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
    },
    open(sealed) {
      const bytes = Buffer.from(sealed, 'base64');
      const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, ivBytes));
      decipher.setAuthTag(bytes.subarray(ivBytes, ivBytes + tagBytes));
      const body = Buffer.concat([decipher.update(bytes.subarray(ivBytes + tagBytes)), decipher.final()]);
      return JSON.parse(body.toString('utf8')) as unknown;
    },
  };
}
