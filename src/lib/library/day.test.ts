import { afterEach, describe, expect, test } from 'vitest';
import { dayOf } from './day';

// Node reads TZ again when it changes, so a test can stand in any time zone.
const zone = process.env.TZ;
afterEach(() => {
  if (zone === undefined) delete process.env.TZ;
  else process.env.TZ = zone;
});

describe('The day of a date (ADR 0019)', () => {
  test('early in the morning in Paris, still the previous day in UTC: the day in Paris', () => {
    process.env.TZ = 'Europe/Paris';

    expect(dayOf(new Date('2026-11-17T23:30:00.000Z'))).toBe('2026-11-18T00:00:00.000Z');
  });

  test('late in the evening in Los Angeles, already the next day in UTC: the day in Los Angeles', () => {
    process.env.TZ = 'America/Los_Angeles';

    expect(dayOf(new Date('2026-11-19T07:30:00.000Z'))).toBe('2026-11-18T00:00:00.000Z');
  });

  test('a single-digit month and day are written on two digits', () => {
    process.env.TZ = 'UTC';

    expect(dayOf(new Date('2027-01-05T12:00:00.000Z'))).toBe('2027-01-05T00:00:00.000Z');
  });
});
