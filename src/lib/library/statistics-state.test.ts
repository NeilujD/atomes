// The filters of Statistics in the URL (ADR 0019, R3): Back and a reload keep them.
import { describe, expect, test } from 'vitest';
import { askedPeriod, readStatisticsQuery, statisticsSearch } from './statistics-state';

describe('the filters of Statistics in the URL', () => {
  test('a year, a Label and "owned only" read back as they were written', () => {
    const search = statisticsSearch({ period: 2025, label: '3lbma', ownedOnly: true });

    expect(search).toBe('?period=2025&label=3lbma&owned=1');
    expect(readStatisticsQuery(search)).toEqual({ period: 2025, label: '3lbma', ownedOnly: true });
  });

  test('All time is written; no filter on writes only the period', () => {
    expect(statisticsSearch({ period: 'all', label: null, ownedOnly: false })).toBe('?period=all');
    expect(readStatisticsQuery('?period=all')).toEqual({ period: 'all', label: null, ownedOnly: false });
  });

  test('no period in the URL: the screen picks its default', () => {
    expect(readStatisticsQuery('')).toEqual({ period: undefined, label: null, ownedOnly: false });
  });

  test('a URL typed by hand: a period that is no year is dropped, and "owned" is on only for 1', () => {
    expect(readStatisticsQuery('?period=soon&owned=yes&label=')).toEqual({ period: undefined, label: null, ownedOnly: false });
    expect(readStatisticsQuery('?period=20260').period).toBeUndefined();
  });
});

describe('the period the screen shows', () => {
  test('the year asked when the Library offers it, All time always, else the default period', () => {
    expect(askedPeriod(2025, [2026, 2025], 2026)).toBe(2025);
    expect(askedPeriod('all', [2026], 2026)).toBe('all');
    expect(askedPeriod(2019, [2026, 2025], 2026)).toBe(2026);
    expect(askedPeriod(undefined, [], 'all')).toBe('all');
  });
});
