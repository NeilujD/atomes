import { describe, expect, test } from 'vitest';
import { returnTarget, signInHref } from './return-to';

describe('returnTarget', () => {
  test.each([
    ['/library', '/library'],
    ['/book?work=isbn%3A9782723488525#notes', '/book?work=isbn%3A9782723488525#notes'],
    ['/series?isbn=9782723488525', '/series?isbn=9782723488525'],
  ])('a screen of this app: %s', (value, target) => {
    expect(returnTarget(value)).toBe(target);
  });

  test.each([
    ['nothing', null],
    ['not text', 42],
    ['empty', ''],
    ['another site', 'https://evil.test/library'],
    ['another site, no scheme', '//evil.test/library'],
    ['another site, backslash', '/\\evil.test/library'],
    ['another site, tab', '/\t/evil.test'],
    ['a script', 'javascript:alert(1)'],
    ['a relative path', 'library'],
    ['the sign-in screen', '/sign-in?next=%2Flibrary'],
    ['an OAuth route', '/oauth/sign-out'],
    ['the API', '/api/session'],
  ])('%s goes Home', (_, value) => {
    expect(returnTarget(value)).toBe('/');
  });
});

describe('signInHref', () => {
  test('carries the screen asked', () => {
    expect(signInHref('/to-buy')).toBe('/sign-in?next=%2Fto-buy');
  });

  test('Home and unsafe targets need no return target', () => {
    expect(signInHref('/')).toBe('/sign-in');
    expect(signInHref('//evil.test')).toBe('/sign-in');
  });
});
