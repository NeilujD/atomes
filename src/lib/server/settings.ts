// The run-time settings of an Atomes instance (ADR 0007, ADR 0013). The image
// holds no secret: each instance gives these as environment variables.
// No import outside `node:`: `scripts/check-settings.ts` runs this file with
// Node alone, before the server starts, so a missing setting stops the start.

export interface Settings {
  // Folder for the SQLite files (the Docker volume, ADR 0007).
  dataDir: string;
  // The https origin readers open: PUBLIC_APP_ORIGIN, or the Coolify URL on a
  // pull request preview. Not set in local development: then the
  // server is a loopback public client on http://127.0.0.1 (spike 0003).
  appOrigin?: string;
  // Port of the loopback redirect URI in local development.
  port: number;
  // Who may make an Account (ADR 0016): SIGN_UP, `invite` when not set. Only
  // `invite` runs today: a new Account needs an Invite (invites.ts).
  signUp: 'invite';
  // 32 bytes. Encrypts OAuth tokens and DPoP keys at rest.
  sessionKey: Buffer;
  // The confidential client's private key, an ES256 JWK with a `kid`, as JSON.
  // Required with `appOrigin`.
  oauthPrivateKey?: string;
  // The SMTP server that sends Sign-in Codes (ADR 0016), as an smtp:// or
  // smtps:// URL with its user and password, and the From of the mails.
  // Required in a built server; the dev server keeps its mails in the dev
  // outbox (mail.ts) and sends none.
  smtpUrl?: string;
  mailFrom?: string;
}

// No parameter property (`readonly problems` in the constructor): Node's type
// stripping cannot run it.
export class SettingsError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Atomes cannot start. Fix these settings:\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
    this.name = 'SettingsError';
    this.problems = problems;
  }
}

// Every problem at once, so one restart is enough. Never puts a secret value in a message.
// `sendsMail: false`: for a script that sends no mail (scripts/invite.ts), the
// mail settings are not asked.
export function readSettings(env: Record<string, string | undefined>, { sendsMail = true } = {}): Settings {
  const problems: string[] = [];

  const preview = previewUrl(env);
  const originName = preview ? 'COOLIFY_URL' : 'PUBLIC_APP_ORIGIN';
  const appOrigin = preview ?? (env.PUBLIC_APP_ORIGIN?.trim() || undefined);
  const httpsOrigin = appOrigin !== undefined && isHttpsOrigin(appOrigin);
  if (appOrigin !== undefined && !httpsOrigin) {
    problems.push(`${originName} must be an https origin, for example https://atomes.example.org. Found: ${appOrigin}`);
  }

  const signUp = env.SIGN_UP?.trim() || 'invite';
  if (signUp === 'open') {
    problems.push('SIGN_UP=open: open sign-up is not built yet. Use SIGN_UP=invite, and make Invites with scripts/invite.ts.');
  } else if (signUp !== 'invite') {
    problems.push(`SIGN_UP must be invite or open. Found: ${signUp}`);
  }

  const sessionKey = Buffer.from(env.SESSION_ENCRYPTION_KEY?.trim() ?? '', 'base64');
  if (!env.SESSION_ENCRYPTION_KEY?.trim()) {
    problems.push('SESSION_ENCRYPTION_KEY is not set: give 32 random bytes in base64 (openssl rand -base64 32).');
  } else if (sessionKey.length !== 32) {
    problems.push('SESSION_ENCRYPTION_KEY must be 32 bytes in base64 (openssl rand -base64 32).');
  }

  const oauthPrivateKey = env.OAUTH_PRIVATE_KEY?.trim() || undefined;
  // Asked only once the origin is right: one problem at a time for that pair.
  if (httpsOrigin) {
    if (!oauthPrivateKey) {
      problems.push('OAUTH_PRIVATE_KEY is not set: an https instance needs its ES256 private key as a JWK (docs/staging-coolify.md).');
    } else if (!isPrivateEs256Jwk(oauthPrivateKey)) {
      problems.push('OAUTH_PRIVATE_KEY must be an ES256 private JWK with a "kid" (kty EC, crv P-256, d).');
    }
  }

  // Required out of the dev server: a built server (NODE_ENV=production in the
  // image) or `bun run phone`.
  const smtpUrl = env.SMTP_URL?.trim() || undefined;
  const mailFrom = env.MAIL_FROM?.trim() || undefined;
  if (sendsMail && env.NODE_ENV !== 'development') {
    if (!smtpUrl) {
      problems.push('SMTP_URL is not set: give the SMTP server that sends Sign-in Codes, for example smtps://user:password@smtp.example.org:465.');
    } else if (!/^smtps?:\/\/[^/]/.test(smtpUrl)) {
      problems.push('SMTP_URL must be an smtp:// or smtps:// URL, for example smtps://user:password@smtp.example.org:465.');
    }
    if (!mailFrom) {
      problems.push('MAIL_FROM is not set: give the sender of the mails, for example "Atomes <atomes@example.org>".');
    } else if (!/[^\s@<]+@[^\s@>]+/.test(mailFrom)) {
      problems.push(`MAIL_FROM must hold an email address, for example "Atomes <atomes@example.org>". Found: ${mailFrom}`);
    }
  }

  const appEnv = env.APP_ENV?.trim();
  if (appEnv && appEnv !== 'production' && appEnv !== 'staging') {
    problems.push(`APP_ENV must be production or staging. Found: ${appEnv}`);
  }

  const port = Number(env.PORT ?? 4321);
  if (!Number.isInteger(port) || port <= 0) problems.push(`PORT must be a port number. Found: ${String(env.PORT)}`);

  if (problems.length > 0) throw new SettingsError(problems);
  return {
    dataDir: env.DATA_DIR?.trim() || 'data',
    appOrigin: appOrigin && new URL(appOrigin).origin,
    port,
    signUp: 'invite',
    sessionKey,
    oauthPrivateKey,
    smtpUrl,
    mailFrom,
  };
}

// A Coolify pull request preview gets the staging variables, so its
// PUBLIC_APP_ORIGIN names staging. Coolify gives the preview's own URL at
// deploy time; the origin still never comes from the request (ADR 0013).
// Coolify puts the URL with its scheme in COOLIFY_URL or COOLIFY_FQDN, by
// version, and the bare hostname in the other. Several domains: the first.
function previewUrl(env: Record<string, string | undefined>): string | undefined {
  if (!isPreview(env)) return undefined;
  return [env.COOLIFY_URL, env.COOLIFY_FQDN].map((value) => value?.split(',')[0]?.trim()).find((value) => value?.includes('://'));
}

function isPreview(env: Record<string, string | undefined>): boolean {
  return /^pull\/\d+\/head$/.test(env.COOLIFY_BRANCH ?? '');
}

// Which instance this is, for the environment badge and the app icons.
// APP_ENV says production or staging; a Coolify pull request preview (which
// gets the staging variables) and the dev server name themselves. A built
// image with no APP_ENV counts as staging, so a missing value shows a badge.
export type AppEnv = 'production' | 'staging' | 'preview' | 'local';

export function appEnvironment(env: Record<string, string | undefined>): AppEnv {
  if (env.NODE_ENV === 'development') return 'local';
  if (isPreview(env)) return 'preview';
  return env.APP_ENV?.trim() === 'production' ? 'production' : 'staging';
}

function isHttpsOrigin(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isPrivateEs256Jwk(value: string): boolean {
  try {
    const jwk = JSON.parse(value) as Record<string, unknown>;
    return jwk.kty === 'EC' && jwk.crv === 'P-256' && typeof jwk.d === 'string' && typeof jwk.kid === 'string';
  } catch {
    return false;
  }
}

let cached: Settings | undefined;

// The settings of this process, read once.
export function settings(): Settings {
  cached ??= readSettings(process.env);
  return cached;
}
