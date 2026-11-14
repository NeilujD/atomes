import { describe, expect, test } from 'vitest';
import { goesBack } from './back';

const origin = 'https://atomes.example';
const opened = { referrer: '', origin, from: null, entries: 2 };

describe('the back arrow of a Book or Series page', () => {
  test('opened from an Atomes page: a step back in history', () => {
    expect(goesBack({ ...opened, referrer: `${origin}/library` })).toBe(true);
  });

  test('no referrer (the installed app), but the page transitions saw the page before: a step back', () => {
    expect(goesBack({ ...opened, from: '/series?isbn=9791042021030' })).toBe(true);
  });

  test('opened from another site, or from nothing (a typed address, a new tab): the Library', () => {
    expect(goesBack({ ...opened, referrer: 'https://example.org/atomes' })).toBe(false);
    expect(goesBack(opened)).toBe(false);
    expect(goesBack({ ...opened, referrer: `${origin}/library`, from: '/library', entries: 1 })).toBe(false);
  });
});
