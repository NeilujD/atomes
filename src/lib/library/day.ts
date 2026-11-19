// A calendar day as the records hold it: the day on the reader's device, written as midnight UTC (ADR 0019).
export function dayOf(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T00:00:00.000Z`;
}

// The value of a date field (`YYYY-MM-DD`) for a stored day; empty for no day.
export function dateFieldValue(stored: string | undefined): string {
  return stored?.slice(0, 10) ?? '';
}

// The stored day of a date field value; no day when the field is empty.
export function storedDay(value: string): string | undefined {
  return value ? `${value}T00:00:00.000Z` : undefined;
}
