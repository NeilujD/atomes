// Resets an instance for debugging and tests: empties the SQLite files in
// DATA_DIR (`data/` by default) in place (src/lib/server/reset.ts). Every
// browser is signed out; the Library and the Catalog are empty. The server
// can keep running. Records on the PDS do not change. Runs with Node alone
// (type stripping): `bun run reset` on a laptop, and in the Docker image from
// the Coolify Terminal (docs/staging-coolify.md, "Reset the data").
//
// Usage: node scripts/reset-env.ts [--keep-catalog] [--production]
//   --keep-catalog  keep catalog.sqlite, so no book source is asked again
//   --production    needed when APP_ENV is production
import { emptyDatabases, resetRefusal } from '../src/lib/server/reset.ts';

const args = process.argv.slice(2);
const refusal = resetRefusal(process.env, { production: args.includes('--production') });
if (refusal) {
  console.error(refusal);
  process.exit(1);
}

const dir = process.env.DATA_DIR?.trim() || 'data';
const emptied = emptyDatabases(dir, { keepCatalog: args.includes('--keep-catalog') });

console.log(
  emptied.length > 0
    ? `Emptied:\n${emptied.map(({ file, rows }) => `  ${file} (${rows} rows)`).join('\n')}`
    : `Nothing to empty in ${dir}/.`,
);
console.log('Sign in again in every browser.');
