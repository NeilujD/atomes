// Versioned schema steps for the SQLite files of an instance (`catalog.sqlite`,
// `library.sqlite`, `auth.sqlite`). Change a schema with a new step at the end
// of its list, never by editing a step that has run. `pragma user_version`
// counts the steps a file has run; each step runs in one transaction.
import { DatabaseSync } from 'node:sqlite';

export type Step = (db: DatabaseSync) => void;

export function migrate(db: DatabaseSync, steps: readonly Step[]): void {
  const { user_version: done } = db.prepare('pragma user_version').get() as { user_version: number };
  for (let i = done; i < steps.length; i++) {
    inTransaction(db, () => {
      steps[i](db);
      db.exec(`pragma user_version = ${i + 1}`);
    });
  }
}

// How long a write waits while another process holds the file's lock (a
// script in the app Terminal, a backup, an E2E helper), before it fails with
// "database is locked". The default is not to wait at all.
const lockWaitMs = 5_000;

// Opens a SQLite file of this server.
export function openFile(file: string): DatabaseSync {
  return new DatabaseSync(file, { timeout: lockWaitMs });
}

// Opens the file and runs the steps it has not run yet.
export function openDatabase(file: string, steps: readonly Step[]): DatabaseSync {
  const db = openFile(file);
  try {
    migrate(db, steps);
  } catch (error) {
    db.close();
    throw error;
  }
  return db;
}

// All of `run` is written, or nothing.
export function inTransaction<T>(db: DatabaseSync, run: () => T): T {
  db.exec('begin');
  try {
    const result = run();
    db.exec('commit');
    return result;
  } catch (error) {
    db.exec('rollback');
    throw error;
  }
}
