import { randomBytes } from 'node:crypto';
import { expect, test } from 'vitest';
import { secretBox } from './secret-box';

const value = { tokenSet: { access_token: 'access-token-in-plain-text' } };

test('a sealed value opens with the same key, and holds no plain text', () => {
  const box = secretBox(randomBytes(32));
  const sealed = box.seal(value);

  expect(sealed).not.toContain('access-token');
  expect(Buffer.from(sealed, 'base64').toString('latin1')).not.toContain('access-token');
  expect(box.open(sealed)).toEqual(value);
});

test('two seals of the same value differ', () => {
  const box = secretBox(randomBytes(32));

  expect(box.seal(value)).not.toBe(box.seal(value));
});

test('another key, or a changed value, does not open', () => {
  const box = secretBox(randomBytes(32));
  const sealed = box.seal(value);
  const changed = Buffer.from(sealed, 'base64');
  changed[changed.length - 1] ^= 1;

  expect(() => secretBox(randomBytes(32)).open(sealed)).toThrow();
  expect(() => box.open(changed.toString('base64'))).toThrow();
});
