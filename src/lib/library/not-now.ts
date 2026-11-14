// Skip in Series Onboarding means "not now": a Quick Add of the same Series
// does not ask again for 30 days. Kept on this device (`localStorage`): the
// day the reader skipped, by Series identifier.
import { isSeries } from './ids';

type Store = Pick<Storage, 'getItem' | 'setItem'>;
type Series = { id: string; sameAs?: readonly string[] };

const key = 'atomes:onboarding-not-now';
const keptMs = 30 * 24 * 60 * 60 * 1000;

export function notNow(store: Store) {
  // Storage can be blocked, or hold a value from another version: nothing kept.
  function read(): Record<string, string> {
    try {
      const kept: unknown = JSON.parse(store.getItem(key) ?? '{}');
      return kept && typeof kept === 'object' && !Array.isArray(kept) ? (kept as Record<string, string>) : {};
    } catch {
      return {};
    }
  }
  const fresh = (skipped: string, now: Date) => now.getTime() - Date.parse(skipped) < keptMs;

  return {
    remember(series: Series, now: Date): void {
      // Old days go: the store stays small.
      const kept = Object.entries(read()).filter(([, skipped]) => fresh(skipped, now));
      try {
        store.setItem(key, JSON.stringify(Object.fromEntries([...kept, [series.id, now.toISOString()]])));
      } catch {
        // See read: the reader is asked again next time.
      }
    },
    said(series: Series, now: Date): boolean {
      return Object.entries(read()).some(([id, skipped]) => isSeries(series, id) && typeof skipped === 'string' && fresh(skipped, now));
    },
  };
}
