import { describe, expect, test } from 'vitest';
import { readSettings, SettingsError } from './settings';

const sessionKey = Buffer.alloc(32, 7).toString('base64');
const privateJwk = JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'x', y: 'y', d: 'private-part-of-the-key', kid: 'key-1' });
const local = { ALLOWED_DIDS: 'did:plc:owner', SESSION_ENCRYPTION_KEY: sessionKey };

function problemsOf(env: Record<string, string | undefined>): string[] {
  try {
    readSettings(env);
  } catch (error) {
    if (error instanceof SettingsError) return error.problems;
    throw error;
  }
  return [];
}

describe('readSettings', () => {
  test('local development: the loopback client, with the allow-list and the session key', () => {
    const settings = readSettings({ ...local, ALLOWED_DIDS: ' did:plc:owner , did:web:friend.example ' });

    expect(settings.appOrigin).toBeUndefined();
    expect([...settings.allowedDids]).toEqual(['did:plc:owner', 'did:web:friend.example']);
    expect(settings.sessionKey).toHaveLength(32);
    expect(settings).toMatchObject({ dataDir: 'data', port: 4321 });
  });

  test('an https instance: the confidential client with its private key', () => {
    const settings = readSettings({ ...local, PUBLIC_APP_ORIGIN: 'https://atomes.example.org/', OAUTH_PRIVATE_KEY: privateJwk });

    expect(settings.appOrigin).toBe('https://atomes.example.org');
    expect(settings.oauthPrivateKey).toBe(privateJwk);
  });

  test('a missing required setting stops the start with a message that names each one', () => {
    expect(() => readSettings({})).toThrow(SettingsError);
    const problems = problemsOf({});

    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/^ALLOWED_DIDS is not set/);
    expect(problems[1]).toMatch(/^SESSION_ENCRYPTION_KEY is not set/);
    expect(problemsOf({ ...local, PUBLIC_APP_ORIGIN: 'https://atomes.example.org' })).toEqual([
      expect.stringMatching(/^OAUTH_PRIVATE_KEY is not set/),
    ]);
  });

  test.each([
    ['an http origin', { PUBLIC_APP_ORIGIN: 'http://atomes.example.org' }, /^PUBLIC_APP_ORIGIN must be an https origin/],
    ['a value that is not a DID', { ALLOWED_DIDS: 'owner.bsky.social' }, /^ALLOWED_DIDS holds a value that is not a DID/],
    ['a short session key', { SESSION_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') }, /^SESSION_ENCRYPTION_KEY must be 32 bytes/],
    [
      'a public key only',
      { PUBLIC_APP_ORIGIN: 'https://atomes.example.org', OAUTH_PRIVATE_KEY: '{"kty":"EC","crv":"P-256","kid":"k"}' },
      /^OAUTH_PRIVATE_KEY must be an ES256 private JWK/,
    ],
  ])('refuses %s', (_, change, problem) => {
    expect(problemsOf({ ...local, ...change })).toEqual([expect.stringMatching(problem)]);
  });

  test('never puts a secret in its message', () => {
    const secrets = { SESSION_ENCRYPTION_KEY: 'c2hvcnQtc2VjcmV0', OAUTH_PRIVATE_KEY: '{"d":"private-part-of-the-key"}' };
    const message = (() => {
      try {
        readSettings({ ALLOWED_DIDS: 'did:plc:owner', PUBLIC_APP_ORIGIN: 'https://atomes.example.org', ...secrets });
      } catch (error) {
        return (error as Error).message;
      }
      return '';
    })();

    expect(message).toContain('SESSION_ENCRYPTION_KEY');
    expect(message).not.toContain(secrets.SESSION_ENCRYPTION_KEY);
    expect(message).not.toContain('private-part-of-the-key');
  });
});
