// E2E journeys in a browser (CORE-73): `bun run test:e2e`. They run on the dev
// server, because /dev/sign-in-as answers 404 in a built server.
import { randomBytes } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';
import { allReaders } from './e2e/readers';

// Not 4321: never the dev server a developer has open, whose Catalog asks the
// real book sources. 127.0.0.1, never `localhost` (src/middleware.ts).
const port = 4322;
const origin = `http://127.0.0.1:${port}`;

const phone = devices['iPhone 14'];

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: origin,
    locale: 'en-US',
    // Requests from a service worker skip context.route: no outside host must get through.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  // Phone size only: 390 px wide (triage, 2026-11-12). Chromium gets the same
  // screen as the iPhone, not its WebKit engine.
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium', viewport: phone.viewport, deviceScaleFactor: phone.deviceScaleFactor, isMobile: true, hasTouch: true },
    },
    { name: 'webkit', use: { ...phone } },
  ],
  webServer: {
    // An empty DATA_DIR on each run: runs share no state. The Catalog answers
    // from the recorded answers, with no network (CORE-72).
    // --ignore-lock: a server in the foreground, that Playwright stops. Without
    // it, Astro starts a background server when an agent runs the command, and
    // starts nothing when the project's own dev server is running.
    command: `rm -rf data-e2e && bun run dev --port ${port} --ignore-lock`,
    url: `${origin}/health`,
    // Never another server on this port: it could ask the real sources.
    reuseExistingServer: false,
    timeout: 120_000,
    // Made for this run only: no secret is stored, and these settings win over `.env.local`.
    env: {
      CATALOG_SOURCES: 'recorded',
      DATA_DIR: 'data-e2e',
      PORT: String(port),
      ALLOWED_DIDS: allReaders().join(','),
      SESSION_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    },
  },
});
