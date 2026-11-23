// The admin page checks the session and the role on the server (ADR 0020):
// anyone but an Admin gets a 404, with no redirect. The instance stores live in
// a temporary DATA_DIR, read once by settings().
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { sessionCookie } from '../lib/server/auth';
import { accountStore, authDeps, roleStore } from '../lib/server/instance';
import Admin from './admin.astro';

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'atomes-admin-page-'));
  vi.stubEnv('DATA_DIR', dir);
  vi.stubEnv('SESSION_ENCRYPTION_KEY', randomBytes(32).toString('base64'));
  // Required settings; no mail goes in these tests.
  vi.stubEnv('SMTP_URL', 'smtp://mail.invalid');
  vi.stubEnv('MAIL_FROM', 'Atomes <atomes@example.org>');
});
afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

async function cookieOf(did: `did:${string}`): Promise<string> {
  const { store } = await authDeps();
  return store.openBrowserSession({ account: accountStore().ofDid(did), handle: '' }).cookie;
}

async function open(cookie?: string) {
  const container = await AstroContainer.create();
  const headers: Record<string, string> = { 'accept-language': 'en' };
  if (cookie) headers.cookie = `${sessionCookie}=${cookie}`;
  return container.renderToResponse(Admin, { request: new Request('http://127.0.0.1:4321/admin', { headers }) });
}

test('a visitor with no session gets a 404, with no redirect', async () => {
  const response = await open();

  expect(response.status).toBe(404);
  expect(response.headers.get('location')).toBeNull();
});

test('a reader gets a 404', async () => {
  const response = await open(await cookieOf('did:plc:reader'));

  expect(response.status).toBe(404);
});

test('an Admin gets the panel, never kept by a cache', async () => {
  const cookie = await cookieOf('did:plc:admin');
  roleStore().grant(accountStore().ofDid('did:plc:admin'), null);

  const response = await open(cookie);

  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
});
