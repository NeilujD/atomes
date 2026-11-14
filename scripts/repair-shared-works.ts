// Repairs, once, the reader records that name a Work the Catalog dropped
// because a source gave it to several Volume numbers (ADR 0010, amendment
// 2026-11-14; src/lib/server/repair-shared-works.ts). Run it after the server
// with this change has started once (it runs the Catalog step), after a backup
// of the Library and the Catalog, with --dry-run first. Runs again with no
// change. `node scripts/repair-shared-works.ts` in the Docker image, which has
// Node and no Bun; `bun scripts/repair-shared-works.ts` on a laptop.
//
// Usage: node scripts/repair-shared-works.ts [--dry-run]
// It opens library.sqlite and catalog.sqlite in DATA_DIR (`data/` by default)
// and asks no source.
import { repairSharedWorks } from '../src/lib/server/repair-shared-works.ts';

const dryRun = process.argv.includes('--dry-run');
const dir = process.env.DATA_DIR?.trim() || 'data';
const repairs = repairSharedWorks(dir, { dryRun });

console.log(dryRun ? 'Dry run: nothing is written.' : 'Repaired.');
if (repairs.length === 0) console.log('No reader record names a dropped Work.');
for (const { did, counts, labels, privateWorks } of repairs) {
  console.log(
    `${did}: ${counts.readingStatuses} Reading Statuses moved, ${counts.copies} Copies changed, ` +
      `${counts.labels} Labels listed, ${counts.privateWorks} Private Works listed (${privateWorks.added.length} kept Private on their new Work)`,
  );
  for (const label of labels) console.log(`  Label ${label.rkey} "${label.name}": ${label.works.join(', ')}`);
  for (const work of privateWorks.listed) console.log(`  Private Work ${work}`);
}
const wrote = repairs.some(({ puts, deletes }) => puts.length > 0 || deletes.length > 0);
if (!dryRun && wrote) console.log('Shared records follow at each reader\'s next record change, Settings visit or sign-in.');
