// What the server does once after a start, at its first health check
// (src/pages/health.ts; Docker and Coolify call it about 30 s after the start).
// It opens `library.sqlite`, `auth.sqlite` and `catalog.sqlite`, so their
// migration steps run before readers need them: without it, the Catalog ran
// its steps only at the first Catalog request. Then it repairs the reader
// records that name a Work the Catalog dropped (ADR 0010, amendment
// 2026-11-21): a repair with nothing left to change writes nothing.
import { catalog } from '../catalog/instance';
import { errorLogText } from './accounts';
import { accountStore } from './instance';
import { repairSharedWorks, type Repair } from './repair-shared-works';
import { settings } from './settings';

let started = false;

// Throws when a file cannot open or a migration step fails: the health check
// then answers 503 and tries again at its next call.
export function startUp(): void {
  if (started) return;
  // library.sqlite and auth.sqlite; then catalog.sqlite, whose steps read the Accounts.
  accountStore();
  catalog();
  started = true;
  try {
    for (const repair of repairSharedWorks(settings().dataDir, { dryRun: false })) console.log(repairLine(repair));
  } catch (error) {
    // The data files work: the server serves readers, and the repair runs again at the next start.
    console.warn(`Repair of shared Works failed: ${errorLogText(error)}`);
  }
}

// Counts and record keys only: no Label name, no reader text in the log.
function repairLine({ account, counts, labels, privateWorks }: Repair): string {
  const parts = [`${counts.readingStatuses} Reading Statuses moved`, `${counts.copies} Copies changed`];
  if (labels.length > 0) parts.push(`Labels to check: ${labels.map((label) => label.rkey).join(', ')}`);
  if (privateWorks.listed.length > 0) parts.push(`${privateWorks.listed.length} Private Works listed`);
  return `Repair of shared Works, Account ${account}: ${parts.join('; ')}`;
}
