import { describe, expect, test } from 'vitest';
import { appEnvironment, landingPage, readSettings, SettingsError } from './settings';

const sessionKey = Buffer.alloc(32, 7).toString('base64');
const privateJwk = JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'x', y: 'y', d: 'private-part-of-the-key', kid: 'key-1' });
const local = { NODE_ENV: 'development', SESSION_ENCRYPTION_KEY: sessionKey };
const smtpUrl = 'smtps://atomes:mail-password@smtp.example.org:465';
// A built server (the Docker image sets NODE_ENV=production) sends Sign-in Codes.
const built = { NODE_ENV: 'production', SESSION_ENCRYPTION_KEY: sessionKey, SMTP_URL: smtpUrl, MAIL_FROM: 'Atomes <atomes@example.org>' };

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
  test('local development: the loopback client, sign-up by Invite and the session key', () => {
    const settings = readSettings(local);

    expect(settings.appOrigin).toBeUndefined();
    expect(settings.signUp).toBe('invite');
    expect(settings.sessionKey).toHaveLength(32);
    expect(settings).toMatchObject({ dataDir: 'data', port: 4321 });
  });

  test('an https instance: the confidential client with its private key', () => {
    const settings = readSettings({ ...local, PUBLIC_APP_ORIGIN: 'https://atomes.example.org/', OAUTH_PRIVATE_KEY: privateJwk });

    expect(settings.appOrigin).toBe('https://atomes.example.org');
    expect(settings.oauthPrivateKey).toBe(privateJwk);
  });

  describe('a Coolify pull request preview, with the staging variables', () => {
    const staging = { ...local, PUBLIC_APP_ORIGIN: 'https://staging.atomes.example', OAUTH_PRIVATE_KEY: privateJwk };

    // Coolify swaps the two names by version: test both.
    test.each([
      ['COOLIFY_URL', { COOLIFY_URL: 'https://34.staging.atomes.example', COOLIFY_FQDN: '34.staging.atomes.example' }],
      ['COOLIFY_FQDN', { COOLIFY_FQDN: 'https://34.staging.atomes.example', COOLIFY_URL: '34.staging.atomes.example' }],
    ])('takes its own origin from %s', (_, coolify) => {
      const settings = readSettings({ ...staging, COOLIFY_BRANCH: 'pull/34/head', ...coolify });

      expect(settings.appOrigin).toBe('https://34.staging.atomes.example');
    });

    test('takes the first of several domains', () => {
      const settings = readSettings({
        ...staging,
        COOLIFY_BRANCH: 'pull/34/head',
        COOLIFY_URL: 'https://34.staging.atomes.example,https://other.example',
      });

      expect(settings.appOrigin).toBe('https://34.staging.atomes.example');
    });

    test('refuses a preview URL that is not https', () => {
      expect(problemsOf({ ...staging, COOLIFY_BRANCH: 'pull/34/head', COOLIFY_URL: 'http://34.staging.atomes.example' })).toEqual([
        expect.stringMatching(/^COOLIFY_URL must be an https origin/),
      ]);
    });

    test("reads the owner's address of PREVIEW_ACCOUNT_EMAIL, trimmed and lower-cased", () => {
      const settings = readSettings({ ...staging, COOLIFY_BRANCH: 'pull/34/head', COOLIFY_URL: 'https://34.staging.atomes.example', PREVIEW_ACCOUNT_EMAIL: ' Owner@Example.org ' });

      expect(settings.previewAccountEmail).toBe('owner@example.org');
    });

    test('refuses a PREVIEW_ACCOUNT_EMAIL that is not one address', () => {
      expect(
        problemsOf({ ...staging, COOLIFY_BRANCH: 'pull/34/head', COOLIFY_URL: 'https://34.staging.atomes.example', PREVIEW_ACCOUNT_EMAIL: 'a@example.org,b@example.org' }),
      ).toEqual([expect.stringMatching(/^PREVIEW_ACCOUNT_EMAIL must be one email address/)]);
    });

    test('staging and production ignore PREVIEW_ACCOUNT_EMAIL, even a wrong one', () => {
      const settings = readSettings({ ...staging, COOLIFY_BRANCH: 'main', PREVIEW_ACCOUNT_EMAIL: 'not an address' });

      expect(settings.previewAccountEmail).toBeUndefined();
    });

    test.each([
      ['staging or production (a branch)', { COOLIFY_BRANCH: 'main', COOLIFY_URL: 'https://other.example' }],
      ['a preview with no URL', { COOLIFY_BRANCH: 'pull/34/head', COOLIFY_FQDN: '34.staging.atomes.example' }],
    ])('keeps PUBLIC_APP_ORIGIN on %s', (_, coolify) => {
      expect(readSettings({ ...staging, ...coolify }).appOrigin).toBe('https://staging.atomes.example');
    });
  });

  test('a missing required setting stops the start with a message that names each one', () => {
    expect(() => readSettings({})).toThrow(SettingsError);
    const problems = problemsOf({});

    expect(problems).toEqual([
      expect.stringMatching(/^SESSION_ENCRYPTION_KEY is not set/),
      expect.stringMatching(/^SMTP_URL is not set/),
      expect.stringMatching(/^MAIL_FROM is not set/),
    ]);
    expect(problemsOf({ ...local, PUBLIC_APP_ORIGIN: 'https://atomes.example.org' })).toEqual([
      expect.stringMatching(/^OAUTH_PRIVATE_KEY is not set/),
    ]);
  });

  test('a built server sends mail through SMTP_URL, from MAIL_FROM', () => {
    expect(readSettings(built)).toMatchObject({ smtpUrl, mailFrom: 'Atomes <atomes@example.org>' });
  });

  test('a script that sends no mail (scripts/invite.ts) needs no mail settings', () => {
    expect(problemsOf({ ...built, SMTP_URL: undefined, MAIL_FROM: undefined })).toHaveLength(2);
    expect(() => readSettings({ ...built, SMTP_URL: undefined, MAIL_FROM: undefined }, { sendsMail: false })).not.toThrow();
  });

  test('the dev server needs no mail settings: its mails stay in the dev outbox', () => {
    expect(readSettings(local).smtpUrl).toBeUndefined();
  });

  test.each([
    ['an SMTP_URL that is not smtp or smtps', { SMTP_URL: 'https://smtp.example.org' }, /^SMTP_URL must be an smtp:\/\/ or smtps:\/\/ URL/],
    ['a MAIL_FROM with no address', { MAIL_FROM: 'Atomes' }, /^MAIL_FROM must hold an email address/],
  ])('a built server refuses %s', (_, change, problem) => {
    expect(problemsOf({ ...built, ...change })).toEqual([expect.stringMatching(problem)]);
  });

  test('never puts the SMTP password in its message', () => {
    const message = (() => {
      try {
        readSettings({ ...built, SMTP_URL: 'ftp://atomes:mail-password@smtp.example.org' });
      } catch (error) {
        return (error as Error).message;
      }
      return '';
    })();

    expect(message).toContain('SMTP_URL');
    expect(message).not.toContain('mail-password');
  });

  test.each([
    ['an http origin', { PUBLIC_APP_ORIGIN: 'http://atomes.example.org' }, /^PUBLIC_APP_ORIGIN must be an https origin/],
    ['open sign-up, not built yet', { SIGN_UP: 'open' }, /^SIGN_UP=open: open sign-up is not built yet/],
    ['an unknown sign-up', { SIGN_UP: 'anyone' }, /^SIGN_UP must be invite or open/],
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
    const secrets = { SESSION_ENCRYPTION_KEY: Buffer.from('short-secret').toString('base64'), OAUTH_PRIVATE_KEY: '{"d":"private-part-of-the-key"}' };
    const message = (() => {
      try {
        readSettings({ PUBLIC_APP_ORIGIN: 'https://atomes.example.org', ...secrets });
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

describe('appEnvironment', () => {
  const preview = { COOLIFY_BRANCH: 'pull/34/head', COOLIFY_URL: 'https://34.staging.atomes.example' };

  test.each([
    ['production', { APP_ENV: 'production' }, 'production'],
    ['staging', { APP_ENV: 'staging' }, 'staging'],
    // A preview gets the staging variables (docs/staging-coolify.md).
    ['a pull request preview', { APP_ENV: 'staging', ...preview }, 'preview'],
    ['the dev server', { NODE_ENV: 'development' }, 'local'],
    // A built image with no value: a badge shows, so the mistake is seen.
    ['a missing value', { NODE_ENV: 'production' }, 'staging'],
  ])('%s', (_, env, name) => {
    expect(appEnvironment(env)).toBe(name);
  });

  test('a start refuses a value that is not production or staging', () => {
    expect(problemsOf({ ...local, APP_ENV: 'prod' })).toEqual([expect.stringMatching(/^APP_ENV must be production or staging/)]);
    expect(problemsOf({ ...local, APP_ENV: 'production' })).toEqual([]);
    expect(problemsOf(local)).toEqual([]);
  });
});

// The Landing page at /welcome (M12, CORE-158): on unless the instance turns it off.
describe('LANDING_PAGE', () => {
  test.each([
    ['missing', {}, true],
    ['on', { LANDING_PAGE: 'on' }, true],
    ['off', { LANDING_PAGE: 'off' }, false],
    ['off, with spaces', { LANDING_PAGE: ' off ' }, false],
  ])('%s', (_, env, on) => {
    expect(readSettings({ ...local, ...env }).landingPage).toBe(on);
    expect(landingPage(env)).toBe(on);
  });

  test('a start refuses a value that is not on or off', () => {
    expect(problemsOf({ ...local, LANDING_PAGE: 'no' })).toEqual(['LANDING_PAGE must be on or off. Found: no']);
  });
});
