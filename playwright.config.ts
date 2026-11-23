// E2E journeys in a browser (CORE-73): `bun run test:e2e`. They run on the dev
// server, because /dev/sign-in-as answers 404 in a built server.
import { randomBytes } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

// Not 4321: never the dev server a developer has open, whose Catalog asks the
// real book sources. 127.0.0.1, never `localhost` (src/middleware.ts). E2E_PORT
// lets runs in two worktrees go side by side.
const port = Number(process.env.E2E_PORT ?? 4322);
const origin = `http://127.0.0.1:${port}`;

const phone = devices['iPhone 14'];

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  // CI: the dev server sends every module on its own, and WebKit draws with no
  // GPU. Its first page change from the animated Shelf Check result screen to
  // Series Onboarding was measured at up to 4.5 s (Linux WebKit, Playwright
  // image), past the default 5 s once the page has to draw. Real phones draw
  // with a GPU. A passing check takes no longer; only a failing one waits more.
  expect: { timeout: process.env.CI ? 10_000 : 5_000 },
  use: {
    baseURL: origin,
    locale: 'en-US',
    // Requests from a service worker skip context.route: no outside host must get through.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  // Phone size only: 390 px wide (triage, 2026-11-12). Chromium gets the same
  // screen as the iPhone, not its WebKit engine.
  // `warm` builds every page on the dev server first (e2e/warm.setup.ts).
  projects: [
    { name: 'warm', testMatch: 'warm.setup.ts' },
    {
      name: 'chromium',
      dependencies: ['warm'],
      use: { browserName: 'chromium', viewport: phone.viewport, deviceScaleFactor: phone.deviceScaleFactor, isMobile: true, hasTouch: true },
    },
    { name: 'webkit', dependencies: ['warm'], use: { ...phone } },
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
    // CI: the dev server log goes to the job log, next to the tests (CORE-136:
    // a page loaded again in the middle of a save). `vite:hmr` says which
    // file change made Vite send a page reload. stderr is piped by default.
    stdout: process.env.CI ? 'pipe' : 'ignore',
    name: 'dev',
    // Made for this run only: no secret is stored, and these settings win over `.env.local`.
    env: {
      CATALOG_SOURCES: 'recorded',
      DEV_TOOLBAR: 'off',
      DATA_DIR: 'data-e2e',
      LANDING_PAGE: 'on',
      // An Admin adds an Account only on an instance that gives a contact: the mail names it (ADR 0020).
      LEGAL_CONTACT: 'operator@atomes.test',
      PORT: String(port),
      SESSION_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      ...(process.env.CI ? { DEBUG: 'vite:hmr' } : {}),
    },
  },
});
