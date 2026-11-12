// The test readers of the E2E suite. Each spec file has its own reader in each
// browser: Chromium and WebKit run the same journeys at the same time on one
// server, and a reader's Library is on that server (library.sqlite), so a
// shared reader would see the books of another journey.
// No Playwright import: playwright.config.ts reads this file too.
import { readdirSync } from 'node:fs';
import { basename } from 'node:path';

export const browsers = ['chromium', 'webkit'] as const;

// A fake DID that names no account, for example did:plc:e2ewebkitquickaddxxxxxx.
// A valid did:plc (24 letters a-z or digits 2-7), so the OAuth client accepts
// it at sign-out as it accepts a real one.
export function readerDid(browser: string, specFile: string): string {
  const name = 'e2e' + `${browser}${basename(specFile, '.spec.ts')}`.toLowerCase().replace(/[^a-z]/g, '');
  if (name.length > 24) throw new Error(`Spec file name too long for a reader DID: ${specFile}`);
  return `did:plc:${name.padEnd(24, 'x')}`;
}

// ALLOWED_DIDS of the E2E server: every reader of every spec file.
export function allReaders(): string[] {
  const specs = readdirSync(import.meta.dirname).filter((file) => file.endsWith('.spec.ts'));
  return browsers.flatMap((browser) => specs.map((spec) => readerDid(browser, spec)));
}
