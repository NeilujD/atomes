// What the Library screens share: read the records the model needs, say what
// became of a save (the `saved.*` texts of src/lib/i18n), and send the waiting saves when the PDS can be reached again.
import { freshListing } from '../space/fresh-listing';
import type { Space, WriteState } from '../space/space';
import { listCopies } from './copy';
import { listFollows } from './follow';
import { listLoans } from './loan';
import type { Library } from './model';
import { listReadingStatuses } from './reading-status';

// stale: the PDS could not be reached; this is the copy on this device.
export async function loadLibrary(space: Space): Promise<{ library: Library; stale: boolean }> {
  const [copies, readingStatuses, follows, loans] = await Promise.all([
    listCopies(space),
    listReadingStatuses(space),
    listFollows(space),
    listLoans(space),
  ]);
  return {
    library: { copies: copies.records, readingStatuses: readingStatuses.records, follows: follows.records, loans: loans.records },
    stale: copies.stale || readingStatuses.stale || follows.stale || loans.stale,
  };
}

// What to tell about several saves at once: refused wins, then waiting.
export function worstState(states: WriteState[]): WriteState {
  return states.find((each) => each === 'refused') ?? states.find((each) => each === 'waiting') ?? 'sent';
}

// The saves kept on this device for the PDS (refused ones do not wait: they stay as they are).
export async function waitingCount(space: Space): Promise<number> {
  return (await space.pending()).filter((write) => write.refused === undefined).length;
}

// Sends the waiting saves until none is left: when the browser is back online,
// on Reconnect, and every 10 s. Calls `sent` once, when they are all on the PDS.
export function sendWhenOnline(space: Space, sent: () => void, failed: (error: unknown) => void): void {
  let told = false;
  const sending = freshListing(
    async () => {
      await space.sendWaiting();
      return { stale: (await waitingCount(space)) > 0 };
    },
    ({ stale }) => {
      if (stale || told) return;
      told = true;
      sent();
    },
    failed,
  );
  void sending.refresh();
}
