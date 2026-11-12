import { describe, expect, test } from 'vitest';
import { flowMove, flowPosition } from './flow';

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
