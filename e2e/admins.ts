import { DatabaseSync } from 'node:sqlite';
import { roleCommand } from '../src/lib/server/roles';

// Grants or revokes the Admin role in the library.sqlite of the E2E server
// (playwright.config.ts), as `scripts/role.ts` does: the Account of the DID
// must exist. A first request makes the server open and migrate the file, so
// only the server ever migrates it.
export async function adminRole(request: { get(url: string): Promise<unknown> }, command: 'grant' | 'revoke', did: string): Promise<void> {
  await request.get('/api/session');
  // The other browser's journey may be writing to the file at this moment.
  const db = new DatabaseSync('data-e2e/library.sqlite', { timeout: 5_000 });
  try {
    const { ok, lines } = roleCommand(db, command, did);
    if (!ok) throw new Error(lines.join(' '));
  } finally {
    db.close();
  }
}
