import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, test, vi } from 'vitest';
import { createCatalog } from '../lib/catalog/catalog';
import { catalogSteps } from '../lib/catalog/migrations';
import { recordedFetch } from '../lib/catalog/recorded.fake';
import { readingStatusCollection } from '../lib/library/reading-status';
import type { AccountId } from '../lib/server/accounts';
import { createLibraryStore } from '../lib/server/library-store';
import { openDatabase } from '../lib/server/migrate';
import { authSteps, librarySteps } from '../lib/server/migrations';

const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function emptyDir() {
  const dir = mkdtempSync(join(tmpdir(), 'atomes-health-'));
  dirs.push(dir);
  return dir;
}

// The first health check of a development server just started on `dir`.
async function firstHealthCheck(dir: string) {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('SESSION_ENCRYPTION_KEY', randomBytes(32).toString('base64'));
  vi.stubEnv('DATA_DIR', dir);
  vi.resetModules();
  const { GET } = await import('./health');
  return GET({} as Parameters<typeof GET>[0]);
}

function stepsRun(file: string) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return (db.prepare('pragma user_version').get() as { user_version: number }).user_version;
  } finally {
    db.close();
  }
}

test('the first health check opens the three data files and runs all their steps', async () => {
  const dir = emptyDir();

  const response = await firstHealthCheck(dir);

  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(stepsRun(join(dir, 'library.sqlite'))).toBe(librarySteps.length);
  expect(stepsRun(join(dir, 'auth.sqlite'))).toBe(authSteps({ ofDid: () => 'unused' as AccountId }).length);
  expect(stepsRun(join(dir, 'catalog.sqlite'))).toBe(catalogSteps({ findDid: () => undefined }).length);
});

test('the first health check moves a Reading Status off a Work the Catalog dropped', async () => {
  const dir = emptyDir();
  // Inventaire gives one Work to Dragon Ball 2 and 3: the Catalog drops it (ADR 0010, amendment 2026-11-14).
  const dropped = 'inv:91e782c2fc0f67739836a22c452f3623';
  const volume2 = '9782876952065';
  const catalog = createCatalog({ file: join(dir, 'catalog.sqlite'), fetch: recordedFetch().fetch, host: 'catalog.test', accounts: { findDid: () => undefined } });
  await catalog.lookup(volume2);
  await catalog.lookup('9782876952072');
  catalog.close();
  const reader = 'account-reader' as AccountId;
  const status = (work: string) => ({ $type: readingStatusCollection, work, isbn: volume2, status: 'read', updatedAt: '2026-11-10T10:00:00.000Z' });
  const library = createLibraryStore(openDatabase(join(dir, 'library.sqlite'), librarySteps));
  library.put(reader, readingStatusCollection, dropped, status(dropped));
  vi.spyOn(console, 'log').mockImplementation(() => undefined);

  const response = await firstHealthCheck(dir);

  expect(response.status).toBe(200);
  expect(library.list(reader, readingStatusCollection)).toEqual([{ rkey: `isbn:${volume2}`, value: status(`isbn:${volume2}`) }]);
  library.close();
});

test('a data file that cannot open answers 503', async () => {
  const dir = emptyDir();
  writeFileSync(join(dir, 'catalog.sqlite'), 'not a database, '.repeat(64));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

  const response = await firstHealthCheck(dir);

  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
});
