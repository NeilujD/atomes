// Backups of the server's SQLite files (ADR 0011): a `VACUUM INTO` snapshot of
// each file, gzipped, encrypted with AES-256-GCM, put in an object store.
// Setup and restore steps: docs/backups.md.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync, gzipSync } from 'node:zlib';

// The Library first: it is the file that cannot be rebuilt (ADR 0007).
export const FILES = ['library.sqlite', 'catalog.sqlite'] as const;

export type Store = {
  put(name: string, body: Uint8Array): Promise<void>;
  get(name: string): Promise<Uint8Array | null>;
};

export type BackupKey = Buffer;

export function parseKey(base64: string): BackupKey {
  const key = Buffer.from(base64.trim(), 'base64');
  if (key.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY must be 32 bytes in base64 (openssl rand -base64 32)');
  return key;
}

// Format: "ATB1", 12-byte IV, ciphertext, 16-byte GCM tag. The file name is
// authenticated, so a Catalog object cannot pass as the Library.
const MAGIC = Buffer.from('ATB1');

function seal(plain: Buffer, key: BackupKey, file: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv).setAAD(Buffer.from(file));
  return Buffer.concat([MAGIC, iv, cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
}

function unseal(sealed: Buffer, key: BackupKey, file: string): Buffer {
  if (!sealed.subarray(0, 4).equals(MAGIC)) throw new Error(`${file}: not an Atomes backup`);
  const iv = sealed.subarray(4, 16);
  const tag = sealed.subarray(sealed.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key, iv).setAAD(Buffer.from(file)).setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(sealed.subarray(16, sealed.length - 16)), decipher.final()]);
  } catch {
    throw new Error(`${file}: cannot decrypt (wrong BACKUP_ENCRYPTION_KEY, or the object was changed)`);
  }
}

const objectName = (stamp: string, file: string) => `${stamp}/${file}.gz.enc`;

// 2026-11-09T15:00:00.123Z -> 2026-11-09T15-00-00Z: sorts by time, no ":" in object names.
const stampOf = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z').replaceAll(':', '-');

// VACUUM INTO writes a consistent copy from a read transaction, so the server
// keeps writing meanwhile (the files are in WAL mode).
function snapshot(file: string): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'atomes-snapshot-'));
  try {
    const out = join(dir, 'snapshot.sqlite');
    const db = new DatabaseSync(file);
    try {
      db.exec('pragma busy_timeout = 10000');
      db.prepare('vacuum into ?').run(out);
    } finally {
      db.close();
    }
    return readFileSync(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function backup(options: { dataDir: string; store: Store; key: BackupKey; now?: Date }) {
  const stamp = stampOf(options.now ?? new Date());
  const files = FILES.filter((file) => existsSync(join(options.dataDir, file)));
  if (files.length === 0) throw new Error(`no SQLite file to back up in ${options.dataDir}`);
  for (const file of files) {
    const plain = gzipSync(snapshot(join(options.dataDir, file)));
    await options.store.put(objectName(stamp, file), seal(plain, options.key, file));
  }
  return { stamp, files };
}

// Restores into a directory with no database yet (a fresh volume), and never
// over a live file. Each file is checked with `integrity_check` before it
// takes its final name.
export async function restore(options: { dataDir: string; store: Store; key: BackupKey; stamp: string }) {
  const present = FILES.filter((file) => existsSync(join(options.dataDir, file)));
  if (present.length > 0) {
    throw new Error(`${options.dataDir} already has ${present.join(', ')}: restore only into an empty volume`);
  }
  const plain = new Map<string, Buffer>();
  for (const file of FILES) {
    const sealed = await options.store.get(objectName(options.stamp, file));
    if (sealed) plain.set(file, gunzipSync(unseal(Buffer.from(sealed), options.key, file)));
  }
  if (plain.size === 0) throw new Error(`no backup at ${options.stamp}`);

  const partial = (file: string) => join(options.dataDir, `${file}.restoring`);
  try {
    for (const [file, bytes] of plain) {
      writeFileSync(partial(file), bytes);
      const db = new DatabaseSync(partial(file), { readOnly: true });
      const check = db.prepare('pragma integrity_check').all() as { integrity_check: string }[];
      db.close();
      if (check.length !== 1 || check[0].integrity_check !== 'ok') {
        throw new Error(`${file}: integrity_check failed: ${JSON.stringify(check)}`);
      }
    }
  } catch (error) {
    for (const file of plain.keys()) rmSync(partial(file), { force: true });
    throw error;
  }
  for (const file of plain.keys()) renameSync(partial(file), join(options.dataDir, file));
  return [...plain.keys()];
}
