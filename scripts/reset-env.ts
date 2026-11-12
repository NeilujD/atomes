// Resets the local environment for debugging and tests: deletes the SQLite
// files in DATA_DIR (`data/` by default). `auth.sqlite` holds the browser and
// OAuth sessions, so every browser is signed out; `library.sqlite` holds the
// Library; `catalog.sqlite` holds the Catalog. The server makes new empty
// files at its next start. Records on the PDS are not changed.
//
// Usage: bun run reset [--keep-catalog]
//   --keep-catalog  keep catalog.sqlite, so no book source is asked again
// Stop the dev server first: it keeps the deleted files open.
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

if (process.env.NODE_ENV === 'production') {
  console.error('NODE_ENV is production: reset-env runs only on a local environment.');
  process.exit(1);
}

const keepCatalog = process.argv.includes('--keep-catalog');
const dir = process.env.DATA_DIR?.trim() || 'data';
const databases = ['auth.sqlite', 'library.sqlite', ...(keepCatalog ? [] : ['catalog.sqlite'])];

const removed = databases
  .flatMap((name) => ['', '-wal', '-shm', '-journal'].map((suffix) => join(dir, name + suffix)))
  .filter((file) => existsSync(file));
for (const file of removed) rmSync(file);

console.log(removed.length > 0 ? `Deleted:\n  ${removed.join('\n  ')}` : `Nothing to delete in ${dir}/.`);
console.log('Start the dev server again, then sign in again.');
