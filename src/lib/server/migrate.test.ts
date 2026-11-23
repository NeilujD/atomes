import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, test } from 'vitest';
import { openFile } from './migrate';

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

// Another process (a script in the app Terminal, an E2E helper) holds the write
// lock for a short time: a write of the server waits for it, and does not fail
// with "database is locked".
test('a write waits while another process holds the lock', async () => {
  dir = mkdtempSync(join(tmpdir(), 'atomes-migrate-'));
  const file = join(dir, 'library.sqlite');
  const setup = new DatabaseSync(file);
  setup.exec('create table t (n integer)');
  setup.close();

  const holder = spawn(process.execPath, [
    '-e',
    `const { DatabaseSync } = require('node:sqlite');
     const db = new DatabaseSync(process.argv[1]);
     db.exec('begin immediate');
     console.log('locked');
     setTimeout(() => { db.exec('commit'); db.close(); }, 300);`,
    file,
  ]);
  const exited = new Promise((resolve) => holder.once('exit', resolve));
  await new Promise<void>((resolve, reject) => {
    holder.stdout.once('data', () => resolve());
    holder.once('error', reject);
  });

  const db = openFile(file);
  try {
    db.prepare('insert into t (n) values (1)').run();
    expect(db.prepare('select count(*) as n from t').get()).toEqual({ n: 1 });
  } finally {
    db.close();
    await exited;
  }
});
