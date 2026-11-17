import { DatabaseSync } from 'node:sqlite';
import { makeInvite } from '../src/lib/server/invites';

// An Invite in the library.sqlite of the E2E server (playwright.config.ts),
// as `scripts/invite.ts` makes it. A first request makes the server open and
// migrate the file, so only the server ever migrates it.
export async function invite(request: { get(url: string): Promise<unknown> }): Promise<string> {
  await request.get('/api/session');
  // The other browser's journey may be writing to the file at this moment.
  const db = new DatabaseSync('data-e2e/library.sqlite', { timeout: 5_000 });
  try {
    return makeInvite(db).token;
  } finally {
    db.close();
  }
}
