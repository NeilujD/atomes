// Makes one Invite (ADR 0016) and prints its link: it works once and for 14
// days. `library.sqlite` keeps only the hash of its token; the link printed
// here is the only copy of the token, so send it to one person only.
// `bun scripts/invite.ts` on a laptop; `node scripts/invite.ts` in the Docker
// image (Coolify Terminal), which has Node and no Bun. The server must have
// started once with this version: it adds the Invite table.
//
// Usage: bun scripts/invite.ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { makeInvite } from '../src/lib/server/invites.ts';
import { readSettings, SettingsError } from '../src/lib/server/settings.ts';

try {
  const { dataDir, appOrigin, port } = readSettings(process.env, { sendsMail: false });
  const file = join(dataDir, 'library.sqlite');
  const db = existsSync(file) ? new DatabaseSync(file) : undefined;
  if (!db?.prepare("select 1 from sqlite_master where type = 'table' and name = 'invite'").get()) {
    console.error(`${file} has no Invite table yet: start the server once, then run this again.`);
    process.exit(1);
  }
  const { token, expiresAt } = makeInvite(db);
  db.close();
  const origin = appOrigin ?? `http://127.0.0.1:${port}`;
  console.log(`${origin}/sign-in#invite=${token}`);
  console.log(`Works once, until ${new Date(expiresAt).toISOString()}.`);
} catch (error) {
  if (!(error instanceof SettingsError)) throw error;
  console.error(error.message);
  process.exit(1);
}
