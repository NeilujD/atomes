// Stops `bun run phone` before the build when PUBLIC_APP_ORIGIN is not a valid
// HTTPS origin. Otherwise the server starts, `/oauth/client-metadata.json`
// answers 404 or 500, and sign-in on the phone fails.
// Uses the same rule as the metadata endpoint (`webClientMetadata`).
//
// Usage: bun --env-file=.env.local scripts/check-app-origin.ts
import { webClientMetadata } from '../src/lib/auth/client-config';

const origin = process.env.PUBLIC_APP_ORIGIN;
if (!origin) {
  console.error('PUBLIC_APP_ORIGIN is not set in .env.local. Set it to https://<machine>.<tailnet>.ts.net (docs/phone-https.md).');
  process.exit(1);
}
try {
  webClientMetadata(origin);
} catch {
  console.error(`PUBLIC_APP_ORIGIN must be an https origin, for example https://<machine>.<tailnet>.ts.net. Found: ${origin}`);
  process.exit(1);
}
