import { describe, expect, test } from 'vitest';
import { flowDrag, flowMove, flowPosition, flowRest, flowSpring, flowStand } from './flow';

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

describe('How a cover stands', () => {
  test('in front: flat, in the middle, in full light', () => {
    expect(flowStand(0)).toEqual({ x: 0, z: -0, turn: 0, shade: 0, opacity: 1, hidden: false });
  });

  test('the next cover on each side: turned, 2/3 of a cover away, pushed back, shaded', () => {
    expect(flowStand(1)).toMatchObject({ x: 0.66, z: -0.84, turn: 1, shade: 0.38 });
    expect(flowStand(-1)).toMatchObject({ x: -0.66, z: -0.84, turn: -1, shade: 0.38 });
  });

  test('the covers after it stack 1/4 of a cover apart, darker each time up to the 5th', () => {
    expect(flowStand(3).x - flowStand(2).x).toBeCloseTo(0.24);
    expect(flowStand(3).shade).toBeGreaterThan(flowStand(2).shade);
    expect(flowStand(9).shade).toBeCloseTo(flowStand(5).shade);
  });

  test('half way through a drag: half turned', () => {
    expect(flowStand(0.5)).toMatchObject({ x: 0.33, turn: 0.5 });
  });

  test('past 5 covers it fades out; past 6.5 it is not drawn', () => {
    expect(flowStand(5).opacity).toBe(1);
    expect(flowStand(5.75).opacity).toBeCloseTo(0.5);
    expect(flowStand(6.5).hidden).toBe(false);
    expect(flowStand(-6.6).hidden).toBe(true);
  });
});

describe('A drag', () => {
  test('moves the flow by the covers dragged', () => {
    expect(flowDrag(2, 1.5, 5)).toBe(3.5);
    expect(flowDrag(2, -2, 5)).toBe(0);
  });

  test('past an end, it gives way at a third of the pace', () => {
    expect(flowDrag(0, -1, 5)).toBeCloseTo(-0.35);
    expect(flowDrag(4, 1, 5)).toBeCloseTo(4.35);
  });
});

describe('Where a released drag comes to rest', () => {
  test('still: the nearest book', () => {
    expect(flowRest(2.4, 0, 5)).toBe(2);
    expect(flowRest(2.6, 0, 5)).toBe(3);
  });

  test('flung: carried on by its speed, within the books', () => {
    expect(flowRest(2.4, 5, 10)).toBe(3);
    expect(flowRest(2, 100, 10)).toBe(8);
    expect(flowRest(2, -100, 10)).toBe(0);
  });
});

describe('The spring to the book at rest', () => {
  test('it gets there with no bounce, then stops', () => {
    let state = { offset: 0, speed: 0, done: false };
    let passed = false;
    for (let frame = 0; frame < 300 && !state.done; frame++) {
      state = flowSpring(state.offset, state.speed, 3, 1 / 60);
      if (state.offset > 3.001) passed = true;
    }
    expect(state).toEqual({ offset: 3, speed: 0, done: true });
    expect(passed).toBe(false);
  });
});
