import { describe, expect, test } from 'vitest';
import { goesBack, openerHref } from './back';

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

  test('opened from another site after an Atomes page: the Library, not a step back out of Atomes', () => {
    expect(goesBack({ ...opened, referrer: 'https://example.org/atomes', from: '/library', entries: 3 })).toBe(false);
  });
});

describe('the close icon of the privacy notice, before the page script runs', () => {
  const host = 'atomes.example';

  test('opened from an Atomes page: that page', () => {
    expect(openerHref(`https://${host}/settings`, host)).toBe('/settings');
    expect(openerHref(`https://${host}/sign-in?invite=x`, host)).toBe('/sign-in');
  });

  test('opened from nothing, from another site, or from itself: Home', () => {
    expect(openerHref(null, host)).toBe('/');
    expect(openerHref('https://example.org/settings', host)).toBe('/');
    expect(openerHref(`https://${host}/privacy`, host)).toBe('/');
    expect(openerHref('not a url', host)).toBe('/');
  });

  test('never a path that leaves the host', () => {
    expect(openerHref(`https://${host}//example.org/x`, host)).toBe('/');
  });
});
