import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { reconnectEvent } from '../network';
import { freshListing } from './fresh-listing';
import { PdsUnavailableError, SpaceError } from './space';

type Listing = { stale: boolean };
const stale: Listing = { stale: true };
const fresh: Listing = { stale: false };
const offline = () => Promise.reject(new TypeError('Failed to fetch'));

// A PDS that answers each read with the next outcome in the list (the last one repeats).
function reads(...outcomes: (() => Promise<Listing>)[]) {
  let index = 0;
  return vi.fn(() => outcomes[Math.min(index++, outcomes.length - 1)]());
}

function setup(load: () => Promise<Listing>) {
  const events = new EventTarget();
  const shown: Listing[] = [];
  const failed: unknown[] = [];
  const listing = freshListing(load, (next) => shown.push(next), (error) => failed.push(error), { retryMs: 1000, events });
  return { listing, events, shown, failed };
}

describe('freshListing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('back online, but the first read still fails: it tries again until the PDS answers', async () => {
    const load = reads(
      () => Promise.resolve(stale),
      () => Promise.resolve(stale),
      () => Promise.resolve(fresh),
    );
    const { listing, events, shown } = setup(load);

    await listing.refresh();
    // `online` comes before the network works: this read gives the copy again.
    events.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);

    expect(shown).toEqual([stale, stale, fresh]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(load).toHaveBeenCalledTimes(3);
  });

  test('the browser never says it is back online: the timer still finds the PDS', async () => {
    const load = reads(
      () => Promise.resolve(stale),
      () => Promise.resolve(fresh),
    );
    const { listing, shown } = setup(load);

    await listing.refresh();
    await vi.advanceTimersByTimeAsync(1000);

    expect(shown).toEqual([stale, fresh]);
  });

  test('Reconnect: a waiting listing is read at once, not at the next timer', async () => {
    const load = reads(
      () => Promise.resolve(stale),
      () => Promise.resolve(fresh),
    );
    const { listing, events, shown } = setup(load);

    await listing.refresh();
    events.dispatchEvent(new Event(reconnectEvent));
    await vi.advanceTimersByTimeAsync(0);

    expect(shown).toEqual([stale, fresh]);
  });

  test('a fresh listing is not read again', async () => {
    const load = reads(() => Promise.resolve(fresh));
    const { listing, events } = setup(load);

    await listing.refresh();
    events.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(5000);

    expect(load).toHaveBeenCalledTimes(1);
  });

  test('no copy and no network: it tries again, and shows the records when the PDS answers', async () => {
    const load = reads(offline, () => Promise.resolve(fresh));
    const { listing, shown, failed } = setup(load);

    await listing.refresh();
    await vi.advanceTimersByTimeAsync(1000);

    expect(failed).toHaveLength(1);
    expect(shown).toEqual([fresh]);
  });

  test('no copy and the PDS failing for a while (HTTP 5xx): it tries again, and shows the records when it works', async () => {
    const load = reads(() => Promise.reject(new PdsUnavailableError(500, 'Internal Server Error')), () => Promise.resolve(fresh));
    const { listing, shown, failed } = setup(load);

    await listing.refresh();
    await vi.advanceTimersByTimeAsync(1000);

    expect(failed).toHaveLength(1);
    expect(shown).toEqual([fresh]);
  });

  test('an error from the PDS is shown and not tried again', async () => {
    const load = reads(() => Promise.reject(new SpaceError('InvalidToken', 'Bad token scope')));
    const { listing, events, failed } = setup(load);

    await listing.refresh();
    events.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(5000);

    expect(failed).toHaveLength(1);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
