// Shows a listing and, while it is not fresh (the stale local copy, or no
// network at all), reads it again until the PDS answers: at once when the
// browser says it is back online, and every `retryMs`. The `online` event can
// come before the network works, or not come at all, so one read on it is not
// enough.
import { isNetworkFailure } from '../network';

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
      // An error from the PDS will not go away on its own: do not try again.
      waiting = isNetworkFailure(error);
      fail(error);
    }
    if (waiting) retry = setTimeout(() => void refresh(), retryMs);
  }

  events.addEventListener('online', () => {
    if (waiting) void refresh();
  });

  return { refresh };
}
