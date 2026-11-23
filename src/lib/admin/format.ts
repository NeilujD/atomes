// Days and times of the admin panel, in the language of the Admin (O4). A day
// of this year shows with no year ("3 Sep"). The server writes them in UTC;
// the page script writes the times of the Admin Log again in the time zone of
// the browser (`localTimes`).
import type { Language } from '../i18n/i18n';

const options = (at: number, now: number): Intl.DateTimeFormatOptions =>
  new Date(at).getUTCFullYear() === new Date(now).getUTCFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' };

// A calendar day (the last active day is one, in UTC).
export function formatDay(language: Language, at: number, now = Date.now()): string {
  return new Intl.DateTimeFormat(language, { ...options(at, now), timeZone: 'UTC' }).format(at);
}

export function formatTime(language: Language, at: number, now = Date.now(), timeZone?: string): string {
  return new Intl.DateTimeFormat(language, { ...options(at, now), hour: '2-digit', minute: '2-digit', timeZone }).format(at);
}

// Every <time data-local> of `root`, in the time zone of this browser.
export function localTimes(root: ParentNode, language: Language): void {
  for (const time of root.querySelectorAll<HTMLTimeElement>('time[data-local]')) {
    time.textContent = formatTime(language, Date.parse(time.dateTime));
  }
}
