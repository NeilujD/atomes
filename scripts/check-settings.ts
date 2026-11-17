// Stops the start when a required setting is missing or wrong, with a clear
// message, before the server listens (ADR 0013). Runs with Node alone (type
// stripping), in the Docker image and in `bun run phone`.
//
// Usage: node scripts/check-settings.ts
import { appEnvironment, readSettings, SettingsError } from '../src/lib/server/settings.ts';

try {
  const { appOrigin, smtpUrl } = readSettings(process.env);
  const client = appOrigin ? `confidential client on ${appOrigin}` : 'loopback client (local development)';
  // The host only: SMTP_URL holds a password.
  const mail = smtpUrl ? `Sign-in Codes sent through ${new URL(smtpUrl).host}` : 'Sign-in Codes kept in the dev outbox';
  console.log(`Atomes settings are fine: ${appEnvironment(process.env)}, ${client}, sign-up by Invite, ${mail}.`);
} catch (error) {
  if (!(error instanceof SettingsError)) throw error;
  console.error(error.message);
  process.exit(1);
}
