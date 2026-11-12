import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { emptyDatabases, resetRefusal } from './reset';

describe('emptyDatabases', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'atomes-reset-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function fill(name: string, rows: number) {
    const db = new DatabaseSync(join(dir, name));
    db.exec('create table thing (id integer primary key); pragma user_version = 3');
    for (let i = 0; i < rows; i++) db.prepare('insert into thing default values').run();
    db.close();
  }

  function state(name: string) {
    const db = new DatabaseSync(join(dir, name));
    const result = {
      rows: (db.prepare('select count(*) as n from thing').get() as { n: number }).n,
      version: (db.prepare('pragma user_version').get() as { user_version: number }).user_version,
    };
    db.close();
    return result;
  }

  test('empties every table and keeps the tables and the schema version', () => {
    fill('auth.sqlite', 2);
    fill('library.sqlite', 3);
    fill('catalog.sqlite', 4);

    expect(emptyDatabases(dir, { keepCatalog: false })).toEqual([
      { file: join(dir, 'auth.sqlite'), rows: 2 },
      { file: join(dir, 'library.sqlite'), rows: 3 },
      { file: join(dir, 'catalog.sqlite'), rows: 4 },
    ]);
    expect(state('library.sqlite')).toEqual({ rows: 0, version: 3 });
    expect(state('catalog.sqlite')).toEqual({ rows: 0, version: 3 });
  });

  test('--keep-catalog keeps the Catalog; a missing file is skipped', () => {
    fill('library.sqlite', 1);
    fill('catalog.sqlite', 4);

    expect(emptyDatabases(dir, { keepCatalog: true })).toEqual([{ file: join(dir, 'library.sqlite'), rows: 1 }]);
    expect(state('catalog.sqlite').rows).toBe(4);
  });

  test('an open connection of the server sees the empty store', () => {
    fill('library.sqlite', 2);
    const server = new DatabaseSync(join(dir, 'library.sqlite'));

    emptyDatabases(dir, { keepCatalog: false });

    expect(server.prepare('select count(*) as n from thing').get()).toEqual({ n: 0 });
    server.close();
  });
});

describe('resetRefusal', () => {
  const built = { NODE_ENV: 'production' };
  const no = { production: false };

  test.each([
    ['a laptop', {}],
    ['staging', { ...built, APP_ENV: 'staging' }],
    ['a pull request preview', { ...built, APP_ENV: 'staging', COOLIFY_BRANCH: 'pull/34/head' }],
  ])('%s may reset', (_, env) => {
    expect(resetRefusal(env, no)).toBeUndefined();
  });

  test('production needs --production', () => {
    expect(resetRefusal({ ...built, APP_ENV: 'production' }, no)).toMatch(/^APP_ENV is production: add --production/);
    expect(resetRefusal({ ...built, APP_ENV: 'production' }, { production: true })).toBeUndefined();
  });

  test('a built image with no APP_ENV is refused, even with --production', () => {
    expect(resetRefusal(built, { production: true })).toMatch(/^APP_ENV is not set/);
  });
});
