// Empties the SQLite files of an instance in place: every row of every table
// goes, the tables and the Catalog's schema version stay. The server can keep
// running: it sees empty stores at its next query, with no restart. Records
// on the PDS do not change. `scripts/reset-env.ts` runs this file with Bun on
// a laptop and with Node alone (type stripping) in the Docker image, so no
// import outside `node:` and `./settings.ts`.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { appEnvironment } from './settings.ts';

// `auth.sqlite`: browser and OAuth sessions, so every browser is signed out.
// `library.sqlite`: the Library. `catalog.sqlite`: the Catalog.
const databases = ['auth.sqlite', 'library.sqlite', 'catalog.sqlite'] as const;

export interface Emptied {
  file: string;
  rows: number;
}

export function emptyDatabases(dataDir: string, options: { keepCatalog: boolean }): Emptied[] {
  return databases
    .filter((name) => !(options.keepCatalog && name === 'catalog.sqlite'))
    .map((name) => join(dataDir, name))
    .filter((file) => existsSync(file))
    .map((file) => ({ file, rows: emptyDatabase(file) }));
}

function emptyDatabase(file: string): number {
  const db = new DatabaseSync(file);
  try {
    // Wait for a write of the running server rather than fail.
    db.exec('pragma busy_timeout = 5000');
    const tables = db.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'").all() as {
      name: string;
    }[];
    let rows = 0;
    db.exec('begin immediate');
    try {
      for (const { name } of tables) rows += Number(db.prepare(`delete from "${name.replaceAll('"', '""')}"`).run().changes);
      db.exec('commit');
    } catch (error) {
      db.exec('rollback');
      throw error;
    }
    return rows;
  } finally {
    db.close();
  }
}

// Why the reset must not run here, or undefined when it may. A laptop (no
// NODE_ENV=production), staging and a pull request preview may always reset.
// Production needs `--production`. A built image with no APP_ENV is refused:
// it may be production with a missing setting (it shows the Staging badge).
export function resetRefusal(env: Record<string, string | undefined>, options: { production: boolean }): string | undefined {
  if (env.NODE_ENV !== 'production') return undefined;
  const appEnv = appEnvironment(env);
  if (appEnv === 'preview' || env.APP_ENV?.trim() === 'staging') return undefined;
  if (env.APP_ENV?.trim() !== 'production') {
    return 'APP_ENV is not set: this may be production. Set APP_ENV to staging or production in Coolify, restart, then run the reset again.';
  }
  if (options.production) return undefined;
  return 'APP_ENV is production: add --production to empty the production data. Take a backup first: node dist/backup.mjs backup';
}
