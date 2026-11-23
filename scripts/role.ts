// Grants, revokes and lists the Admin role (ADR 0020). It is how the first
// Admin comes: an Account that exists gets the role; the script makes no
// Account. It can revoke the last Admin, which the panel cannot.
// `bun scripts/role.ts` on a laptop; `node scripts/role.ts` in the Docker
// image (Coolify Terminal), which has Node and no Bun. The server must have
// started once with this version: it adds the role table.
//
// Usage: bun scripts/role.ts grant|revoke <email address or DID>
//        bun scripts/role.ts list
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { roleCommand } from '../src/lib/server/roles.ts';
import { readSettings, SettingsError } from '../src/lib/server/settings.ts';

try {
  const { dataDir } = readSettings(process.env, { sendsMail: false });
  const file = join(dataDir, 'library.sqlite');
  if (!existsSync(file)) {
    console.error(`${file} does not exist: start the server once, then run this again.`);
    process.exit(1);
  }
  const db = new DatabaseSync(file);
  const [command, identity] = process.argv.slice(2);
  const { ok, lines, warning } = roleCommand(db, command, identity);
  db.close();
  for (const line of lines) (ok ? console.log : console.error)(line);
  if (warning) console.warn(`Warning: ${warning}`);
  if (!ok) process.exit(1);
} catch (error) {
  if (!(error instanceof SettingsError)) throw error;
  console.error(error.message);
  process.exit(1);
}
