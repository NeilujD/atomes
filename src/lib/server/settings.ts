// The run-time settings of an Atomes instance (ADR 0007, ADR 0013). The image
// holds no secret: each instance gives these as environment variables.
// No import outside `node:`: `scripts/check-settings.ts` runs this file with
// Node alone, before the server starts, so a missing setting stops the start.

export interface Settings {
  // Folder for the SQLite files (the Docker volume, ADR 0007).
  dataDir: string;
  // The https origin readers open. Not set in local development: then the
  // server is a loopback public client on http://127.0.0.1 (spike 0003).
  appOrigin?: string;
  // Port of the loopback redirect URI in local development.
  port: number;
  // Who may sign in to this instance (ADR 0013).
  allowedDids: ReadonlySet<string>;
  // 32 bytes. Encrypts OAuth tokens and DPoP keys at rest.
  sessionKey: Buffer;
  // The confidential client's private key, an ES256 JWK with a `kid`, as JSON.
  // Required with `appOrigin`.
  oauthPrivateKey?: string;
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

const didPattern = /^did:(plc|web):[a-zA-Z0-9._:%-]+$/;

// Every problem at once, so one restart is enough. Never puts a secret value in a message.
export function readSettings(env: Record<string, string | undefined>): Settings {
  const problems: string[] = [];

  const appOrigin = env.PUBLIC_APP_ORIGIN?.trim() || undefined;
  if (appOrigin !== undefined && !isHttpsOrigin(appOrigin)) {
    problems.push(`PUBLIC_APP_ORIGIN must be an https origin, for example https://atomes.example.org. Found: ${appOrigin}`);
  }

  const allowed = (env.ALLOWED_DIDS ?? '')
    .split(',')
    .map((did) => did.trim())
    .filter(Boolean);
  if (allowed.length === 0) {
    problems.push('ALLOWED_DIDS is not set: give the DIDs that may sign in, separated by commas (did:plc:…).');
  }
  for (const did of allowed) {
    if (!didPattern.test(did)) problems.push(`ALLOWED_DIDS holds a value that is not a DID: ${did}`);
  }

  const sessionKey = Buffer.from(env.SESSION_ENCRYPTION_KEY?.trim() ?? '', 'base64');
  if (!env.SESSION_ENCRYPTION_KEY?.trim()) {
    problems.push('SESSION_ENCRYPTION_KEY is not set: give 32 random bytes in base64 (openssl rand -base64 32).');
  } else if (sessionKey.length !== 32) {
    problems.push('SESSION_ENCRYPTION_KEY must be 32 bytes in base64 (openssl rand -base64 32).');
  }

  const oauthPrivateKey = env.OAUTH_PRIVATE_KEY?.trim() || undefined;
  if (appOrigin !== undefined) {
    if (!oauthPrivateKey) {
      problems.push('OAUTH_PRIVATE_KEY is not set: an https instance needs its ES256 private key as a JWK (docs/staging-coolify.md).');
    } else if (!isPrivateEs256Jwk(oauthPrivateKey)) {
      problems.push('OAUTH_PRIVATE_KEY must be an ES256 private JWK with a "kid" (kty EC, crv P-256, d).');
    }
  }

  const port = Number(env.PORT ?? 4321);
  if (!Number.isInteger(port) || port <= 0) problems.push(`PORT must be a port number. Found: ${String(env.PORT)}`);

  if (problems.length > 0) throw new SettingsError(problems);
  return {
    dataDir: env.DATA_DIR?.trim() || 'data',
    appOrigin: appOrigin && new URL(appOrigin).origin,
    port,
    allowedDids: new Set(allowed),
    sessionKey,
    oauthPrivateKey,
  };
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
