// Stops the start when a required setting is missing or wrong, with a clear
// message, before the server listens (ADR 0013). Runs with Node alone (type
// stripping), in the Docker image and in `bun run phone`.
//
// Usage: node scripts/check-settings.ts
import { readSettings, SettingsError } from '../src/lib/server/settings.ts';

try {
  const { appOrigin, allowedDids } = readSettings(process.env);
  const client = appOrigin ? `confidential client on ${appOrigin}` : 'loopback client (local development)';
  console.log(`Atomes settings are fine: ${client}, ${allowedDids.size} allowed DID(s).`);
} catch (error) {
  if (!(error instanceof SettingsError)) throw error;
  console.error(error.message);
  process.exit(1);
}
