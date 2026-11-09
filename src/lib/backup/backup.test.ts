import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, test } from 'vitest';
import { backup, parseKey, restore, type Store } from './backup';

const key = parseKey(Buffer.alloc(32, 7).toString('base64'));
const otherKey = parseKey(Buffer.alloc(32, 8).toString('base64'));
const at = new Date('2026-11-09T15:00:00.123Z');

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function emptyDir() {
  const dir = mkdtempSync(join(tmpdir(), 'atomes-backup-'));
  dirs.push(dir);
  return dir;
}

function memoryStore() {
  const objects = new Map<string, Uint8Array>();
  const store: Store = {
    put: (name, body) => {
      objects.set(name, body);
      return Promise.resolve();
    },
    get: (name) => Promise.resolve(objects.get(name) ?? null),
  };
  return { store, objects };
}

// A database in WAL mode with a write still open on another connection, like
// the running server while the Scheduled Task runs.
function seed(dir: string, name: string, rows: string[]) {
  const db = new DatabaseSync(join(dir, name));
  db.exec('pragma journal_mode = wal; create table t (v text)');
  for (const v of rows) db.prepare('insert into t (v) values (?)').run(v);
  return db;
}

const rowsOf = (file: string) => {
  const db = new DatabaseSync(file, { readOnly: true });
  const rows = (db.prepare('select v from t order by rowid').all() as { v: string }[]).map((r) => r.v);
  db.close();
  return rows;
};

describe('backup then restore', () => {
  test('both files come back in a fresh directory with every row', async () => {
    const live = emptyDir();
    const library = seed(live, 'library.sqlite', ['loan 1', 'note 2']);
    const catalog = seed(live, 'catalog.sqlite', ['edition 9782723478991']);
    const { store, objects } = memoryStore();

    const saved = await backup({ dataDir: live, store, key, now: at });
    library.close();
    catalog.close();

    expect(saved).toEqual({ stamp: '2026-11-09T15-00-00Z', files: ['library.sqlite', 'catalog.sqlite'] });
    expect([...objects.keys()].sort()).toEqual([
      '2026-11-09T15-00-00Z/catalog.sqlite.gz.enc',
      '2026-11-09T15-00-00Z/library.sqlite.gz.enc',
    ]);

    const fresh = emptyDir();
    const restored = await restore({ dataDir: fresh, store, key, stamp: saved.stamp });
    expect(restored).toEqual(['library.sqlite', 'catalog.sqlite']);
    expect(rowsOf(join(fresh, 'library.sqlite'))).toEqual(['loan 1', 'note 2']);
    expect(rowsOf(join(fresh, 'catalog.sqlite'))).toEqual(['edition 9782723478991']);
  });

  test('the snapshot holds committed rows only, while a write is open', async () => {
    const live = emptyDir();
    const library = seed(live, 'library.sqlite', ['committed']);
    library.exec("begin; insert into t (v) values ('not yet')");
    const { store } = memoryStore();

    const saved = await backup({ dataDir: live, store, key, now: at });
    library.exec('commit');
    library.close();

    const fresh = emptyDir();
    await restore({ dataDir: fresh, store, key, stamp: saved.stamp });
    expect(rowsOf(join(fresh, 'library.sqlite'))).toEqual(['committed']);
  });

  test('a missing file is skipped; no file at all is an error', async () => {
    const live = emptyDir();
    seed(live, 'catalog.sqlite', ['x']).close();
    const { store } = memoryStore();

    expect(await backup({ dataDir: live, store, key, now: at })).toEqual({
      stamp: '2026-11-09T15-00-00Z',
      files: ['catalog.sqlite'],
    });
    await expect(backup({ dataDir: emptyDir(), store, key, now: at })).rejects.toThrow(/no SQLite file/);
  });

  test('the stored objects are encrypted', async () => {
    const live = emptyDir();
    seed(live, 'library.sqlite', ['a private note']).close();
    const { store, objects } = memoryStore();
    await backup({ dataDir: live, store, key, now: at });

    const body = Buffer.from(objects.get('2026-11-09T15-00-00Z/library.sqlite.gz.enc')!);
    expect(body.subarray(0, 4).toString()).toBe('ATB1');
    expect(() => gunzipSync(body.subarray(16))).toThrow();
    expect(body.includes('a private note')).toBe(false);
  });
});

describe('restore refuses', () => {
  async function savedBackup() {
    const live = emptyDir();
    seed(live, 'library.sqlite', ['x']).close();
    const memory = memoryStore();
    const saved = await backup({ dataDir: live, store: memory.store, key, now: at });
    return { ...memory, stamp: saved.stamp };
  }

  test('a directory that already has a database, and writes nothing', async () => {
    const { store, stamp } = await savedBackup();
    const dir = emptyDir();
    writeFileSync(join(dir, 'catalog.sqlite'), 'keep me');

    await expect(restore({ dataDir: dir, store, key, stamp })).rejects.toThrow(/catalog\.sqlite/);
    expect(existsSync(join(dir, 'library.sqlite'))).toBe(false);
  });

  test('the wrong key', async () => {
    const { store, stamp } = await savedBackup();
    const dir = emptyDir();
    await expect(restore({ dataDir: dir, store, key: otherKey, stamp })).rejects.toThrow();
    expect(existsSync(join(dir, 'library.sqlite'))).toBe(false);
  });

  test('a Catalog object put in place of the Library one', async () => {
    const { store, objects, stamp } = await savedBackup();
    const live = emptyDir();
    seed(live, 'catalog.sqlite', ['y']).close();
    await backup({ dataDir: live, store, key, now: new Date('2026-11-09T16:00:00Z') });
    objects.set(`${stamp}/library.sqlite.gz.enc`, objects.get('2026-11-09T16-00-00Z/catalog.sqlite.gz.enc')!);

    await expect(restore({ dataDir: emptyDir(), store, key, stamp })).rejects.toThrow();
  });

  test('a time with no backup', async () => {
    const { store } = await savedBackup();
    await expect(restore({ dataDir: emptyDir(), store, key, stamp: '2020-01-01T00-00-00Z' })).rejects.toThrow(
      /no backup/,
    );
  });
});

test('parseKey wants 32 bytes in base64', () => {
  expect(() => parseKey('')).toThrow(/32 bytes/);
  expect(() => parseKey(Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/);
});
