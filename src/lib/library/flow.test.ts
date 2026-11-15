import { describe, expect, test } from 'vitest';
import { flowMove, flowNearest, flowPosition, flowStand } from './flow';

// Books known by their Work only: the flow needs no more.
const books = (...works: string[]) => works.map((work) => ({ work }));
const five = books('a', 'b', 'c', 'd', 'e');

describe('Where Cover flow stands', () => {
  test('it starts on the book in the middle', () => {
    expect(flowPosition(five, undefined)).toBe(2);
    expect(flowPosition(books('a', 'b'), undefined)).toBe(1);
    expect(flowPosition(books('a'), undefined)).toBe(0);
  });

  test('it stands where the reader moved to', () => {
    expect(flowPosition(five, flowMove(five, 4))).toBe(4);
    expect(flowPosition(five, flowMove(five, 0))).toBe(0);
  });

  test('a move stops at each end', () => {
    expect(flowPosition(five, flowMove(five, -1))).toBe(0);
    expect(flowPosition(five, flowMove(five, 5))).toBe(4);
  });

  test('other books (a search, a filter, another sort): it starts again in the middle', () => {
    const moved = flowMove(five, 4);

    expect(flowPosition(books('a', 'b', 'c'), moved)).toBe(1);
    expect(flowPosition(books('e', 'd', 'c', 'b', 'a'), moved)).toBe(2);
  });
});

describe('Which cover a swipe stops on (phone)', () => {
  // The middles of four covers, 100 px apart.
  const middles = [50, 150, 250, 350];

  test('the cover whose middle is nearest the middle of the strip', () => {
    expect(flowNearest(middles, 50)).toBe(0);
    expect(flowNearest(middles, 240)).toBe(2);
    expect(flowNearest(middles, 290)).toBe(2);
    expect(flowNearest(middles, 310)).toBe(3);
  });

  test('past an end, the cover at that end', () => {
    expect(flowNearest(middles, -80)).toBe(0);
    expect(flowNearest(middles, 900)).toBe(3);
  });
});

describe('How a cover stands in the phone strip', () => {
  test('in front: flat, in the middle, full size', () => {
    expect(flowStand(0)).toEqual({ shift: 0, turn: 0, scale: 1 });
  });

  test('the next cover on each side: turned, 3/4 of a cover away, smaller', () => {
    expect(flowStand(1)).toEqual({ shift: 0.75, turn: 1, scale: 0.8 });
    expect(flowStand(-1)).toEqual({ shift: -0.75, turn: -1, scale: 0.8 });
  });

  test('the covers after it stack 1/5 of a cover apart, as on desktop', () => {
    expect(flowStand(3).shift).toBeCloseTo(1.15);
    expect(flowStand(-3).shift).toBeCloseTo(-1.15);
  });

  test('half way through a swipe: half turned', () => {
    expect(flowStand(0.5)).toEqual({ shift: 0.375, turn: 0.5, scale: 0.9 });
  });
});
