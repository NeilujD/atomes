// Shows a listing and, while it is not fresh (the stale local copy, or no
// network or a failing PDS and no copy), reads it again until the PDS answers: at once when the
// browser says it is back online, and every `retryMs`. The `online` event can
// come before the network works, or not come at all, so one read on it is not
// enough. Reconnect (src/lib/connection.ts) also reads it again at once.
import { reconnectEvent } from '../network';
import { isTemporaryFailure } from './space';

export function freshListing<T extends { stale: boolean }>(
  load: () => Promise<T>,
  show: (listing: T) => void,
  fail: (error: unknown) => void,
  { retryMs = 10_000, events = globalThis }: { retryMs?: number; events?: EventTarget } = {},
): { refresh: () => Promise<void> } {
  let retry: ReturnType<typeof setTimeout> | undefined;
  let waiting = false;

  async function refresh() {
    clearTimeout(retry);
    try {
      const listing = await load();
      waiting = listing.stale;
      show(listing);
    } catch (error) {
      // A refusal from the PDS will not go away on its own: do not try again.
      waiting = isTemporaryFailure(error);
      fail(error);
    }
    if (waiting) retry = setTimeout(() => void refresh(), retryMs);
  }

  const again = () => {
    if (waiting) void refresh();
  };
  events.addEventListener('online', again);
  events.addEventListener(reconnectEvent, again);

  return { refresh };
}
