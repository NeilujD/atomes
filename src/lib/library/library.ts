// What the Library screens share: read the records the model needs, say what
// became of a save, and send the waiting saves when the network returns.
import { freshListing } from '../space/fresh-listing';
import type { Space, WriteState } from '../space/space';
import { listCopies } from './copy';
import type { Library } from './model';
import { listReadingStatuses } from './reading-status';

// stale: the PDS could not be reached; this is the copy on this device.
export async function loadLibrary(space: Space): Promise<{ library: Library; stale: boolean }> {
  const [copies, readingStatuses] = await Promise.all([listCopies(space), listReadingStatuses(space)]);
  return {
    library: { copies: copies.records, readingStatuses: readingStatuses.records },
    stale: copies.stale || readingStatuses.stale,
  };
}

export const savedMessage: Record<WriteState, string> = {
  sent: 'Saved to your PDS.',
  waiting: 'Waiting: saved on this device. It goes to your PDS when the network returns.',
  refused: 'Your PDS refused this change, so it is not saved.',
};

// The saves kept on this device for the PDS (refused ones do not wait: they stay as they are).
export async function waitingCount(space: Space): Promise<number> {
  return (await space.pending()).filter((write) => write.refused === undefined).length;
}

// Sends the waiting saves until none is left: when the browser is back online,
// on Reconnect, and every 10 s. Calls `sent` once they are all on the PDS.
export function sendWhenOnline(space: Space, sent: () => void, failed: (error: unknown) => void): void {
  const sending = freshListing(
    async () => {
      await space.sendWaiting();
      return { stale: (await waitingCount(space)) > 0 };
    },
    ({ stale }) => {
      if (!stale) sent();
    },
    failed,
  );
  void sending.refresh();
}
