// @vitest-environment happy-dom
import { runInThisContext } from 'node:vm';
import { describe, expect, test } from 'vitest';
import { fliesHome, pageTransitionScript, transitionDirection, type Trip } from './page-transition';

describe('transitionDirection', () => {
  test.each([
    ['/library', '/book?work=isbn%3A9782723478991', 'forward'],
    ['/library', '/series?isbn=9782723478991', 'forward'],
    ['/series?isbn=9782723478991', '/book?work=isbn%3A9782723478991', 'forward'],
    ['/check', '/book?work=isbn%3A9782723478991', 'forward'],
    ['/book?work=isbn%3A9782723478991', '/library', 'back'],
    ['/book?work=isbn%3A9782723478991', '/series?isbn=9782723478991', 'back'],
    ['/series?isbn=9782723478991', '/', 'back'],
    ['/library', '/to-buy', null],
    ['/', '/settings', null],
    ['/book?work=a', '/book?work=b', null],
  ] as const)('%s to %s: %s', (from, to, direction) => {
    expect(transitionDirection(from, to)).toBe(direction);
  });
});

describe('fliesHome', () => {
  const trip: Trip = { back: '/library', book: '/book?work=isbn%3A9782723478991', rect: { left: 16, top: 120, width: 96, height: 144 } };

  test('from the Book of the trip to the page it was opened from', () => {
    expect(fliesHome(trip, trip.book, '/library')).toBe(true);
  });

  test('not to another page: no slot to land in', () => {
    expect(fliesHome(trip, trip.book, '/series?isbn=9782723478991')).toBe(false);
    expect(fliesHome(trip, trip.book, '/library?view=list')).toBe(false);
  });

  test('not from another Book', () => {
    expect(fliesHome(trip, '/book?work=isbn%3A9791042021030', '/library')).toBe(false);
  });

  test('not with no trip', () => {
    expect(fliesHome(null, trip.book, '/library')).toBe(false);
  });
});

test('the inline script runs on its own, with no module around it', () => {
  expect(() => void runInThisContext(pageTransitionScript)).not.toThrow();
  // A navigation with no transition (reduced motion, reload): nothing to do, no error.
  expect(() => {
    dispatchEvent(new Event('pageswap'));
    dispatchEvent(new Event('pagereveal'));
  }).not.toThrow();
});
