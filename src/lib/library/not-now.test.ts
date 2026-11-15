import { describe, expect, test } from 'vitest';
import { notNow } from './not-now';

// A device store in memory, like localStorage.
function deviceStore() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

const onePiece = { id: 'wd:Q673', sameAs: ['atomes:catalog.test:01M750SM80AX373XJ01DSVNDXC'] };
const blacksad = { id: 'wd:Q1000001', sameAs: [] };
const day = 24 * 60 * 60 * 1000;
const skipped = new Date('2026-11-14T12:00:00.000Z');
const later = (days: number) => new Date(skipped.getTime() + days * day);

describe('Skip in Series Onboarding means "not now"', () => {
  test('the same Series is not asked again for 30 days, then it is', () => {
    const memory = notNow(deviceStore());
    memory.remember(onePiece, skipped);

    expect(memory.said(onePiece, later(29))).toBe(true);
    expect(memory.said(onePiece, later(31))).toBe(false);
  });

  test('another Series is still asked', () => {
    const memory = notNow(deviceStore());
    memory.remember(onePiece, skipped);

    expect(memory.said(blacksad, later(1))).toBe(false);
  });

  test('a Series the Catalog now names by another identifier is the same Series', () => {
    const memory = notNow(deviceStore());
    memory.remember({ id: onePiece.sameAs[0], sameAs: [] }, skipped);

    expect(memory.said(onePiece, later(1))).toBe(true);
  });

  test('a kept value the app cannot read, or a blocked store, asks again', () => {
    const broken = deviceStore();
    broken.setItem('atomes:onboarding-not-now', '<img src=x>');
    expect(notNow(broken).said(onePiece, later(1))).toBe(false);

    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => notNow(blocked).remember(onePiece, skipped)).not.toThrow();
    expect(notNow(blocked).said(onePiece, later(1))).toBe(false);
  });
});
