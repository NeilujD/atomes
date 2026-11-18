// The filters of Statistics live in the URL (ADR 0019, R3):
// `/statistics?period=2026&label=<rkey>&owned=1`. Each choice is a new
// history entry, so Back restores the earlier one and a reload keeps it.
// Pure: the URL may be typed by hand, so a bad part is dropped.
import type { Period, StatsQuery } from './stats';

// What the URL asks for. No period: the screen shows its default (stats.ts).
export type AskedStatistics = Omit<StatsQuery, 'period'> & { period?: Period };

export function readStatisticsQuery(search: string): AskedStatistics {
  const params = new URLSearchParams(search);
  const period = params.get('period');
  return {
    period: period === 'all' ? 'all' : period && /^\d{4}$/.test(period) ? Number(period) : undefined,
    label: params.get('label') || null,
    ownedOnly: params.get('owned') === '1',
  };
}

export function statisticsSearch({ period, label, ownedOnly }: StatsQuery): string {
  const params = new URLSearchParams({ period: String(period) });
  if (label) params.set('label', label);
  if (ownedOnly) params.set('owned', '1');
  return `?${params}`;
}

// The period shown: the year asked when the Library offers it, All time
// always, else the default (a year with no date left, or no period asked).
export function askedPeriod(asked: Period | undefined, years: number[], otherwise: Period): Period {
  return asked === 'all' || (asked !== undefined && years.includes(asked)) ? asked : otherwise;
}
