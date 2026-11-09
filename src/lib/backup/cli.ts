// `node dist/backup.mjs backup` and `node dist/backup.mjs restore <stamp>`:
// the commands of docs/backups.md. `bun run build` bundles this file into
// dist/backup.mjs, so the image runs it with Node alone (ADR 0007).
import { backup, parseKey, restore } from './backup';
import { s3Store } from './s3';

const SETTINGS = [
  'BACKUP_S3_ENDPOINT',
  'BACKUP_S3_BUCKET',
  'BACKUP_S3_ACCESS_KEY_ID',
  'BACKUP_S3_SECRET_ACCESS_KEY',
  'BACKUP_ENCRYPTION_KEY',
] as const;

function settings() {
  const missing = SETTINGS.filter((name) => !process.env[name]);
  if (missing.length > 0) throw new Error(`missing settings: ${missing.join(', ')}`);
  const env = process.env as Record<(typeof SETTINGS)[number], string>;
  return {
    dataDir: process.env.DATA_DIR ?? 'data',
    key: parseKey(env.BACKUP_ENCRYPTION_KEY),
    store: s3Store({
      endpoint: env.BACKUP_S3_ENDPOINT,
      bucket: env.BACKUP_S3_BUCKET,
      accessKeyId: env.BACKUP_S3_ACCESS_KEY_ID,
      secretAccessKey: env.BACKUP_S3_SECRET_ACCESS_KEY,
    }),
  };
}

async function main([command, stamp]: string[]) {
  if (command === 'backup') {
    const saved = await backup(settings());
    console.log(`backup ${saved.stamp}: ${saved.files.join(', ')}`);
  } else if (command === 'restore' && stamp) {
    const options = settings();
    const restored = await restore({ ...options, stamp });
    console.log(`restored ${stamp} into ${options.dataDir}: ${restored.join(', ')}`);
  } else {
    throw new Error('usage: node dist/backup.mjs backup | restore <stamp, e.g. 2026-11-09T15-00-00Z>');
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(`backup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
