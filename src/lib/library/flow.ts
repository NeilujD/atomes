// Cover flow mode: which book stands in front. Pure;
// src/islands/LibraryCoverFlow.tsx renders it.
import type { LibraryBook } from './browse';

type Books = Pick<LibraryBook, 'work'>[];

// Where the reader moved to, and in which books.
export interface FlowMove {
  to: number;
  works: string;
}

const worksOf = (books: Books) => books.map(({ work }) => work).join(' ');

// The place of the book in front: where the reader moved to, else the middle.
// Other books (a search, a filter, another sort): the flow starts again in
// the middle.
export function flowPosition(books: Books, moved: FlowMove | undefined): number {
  return moved?.works === worksOf(books) ? moved.to : Math.floor(books.length / 2);
}

// A move to the place `to` in these books; it stops at each end.
export function flowMove(books: Books, to: number): FlowMove {
  return { to: Math.min(Math.max(to, 0), books.length - 1), works: worksOf(books) };
}

// How a cover stands when it is `offset` covers from the front (a fraction
// while the reader drags): flat in front; the next one turned, 2/3 of a cover
// away and pushed back; the ones after stacked 1/4 of a cover apart. `x` and
// `z`: in cover widths from the front; `turn`: -1 turned to the left edge, 1
// to the right one; `shade`: how much of the ground lies over it; past 5
// covers it fades out, past 6.5 it is not drawn.
export function flowStand(offset: number): { x: number; z: number; turn: number; shade: number; opacity: number; hidden: boolean } {
  const away = Math.abs(offset);
  const side = offset < 0 ? -1 : 1;
  const near = Math.min(away, 1);
  const far = Math.max(away - 1, 0);
  return {
    x: side * (near * 0.66 + far * 0.24),
    z: -near * 0.84 - far * 0.1,
    turn: side * near,
    shade: Math.min(0.75, near * 0.38 + Math.min(far, 4) * 0.06),
    opacity: away > 5 ? Math.max(0, 1 - (away - 5) / 1.5) : 1,
    hidden: away > 6.5,
  };
}

// Where a drag of `moved` covers from `start` stands, among `count` books:
// past an end it gives way, at a third of the pace.
export function flowDrag(start: number, moved: number, count: number): number {
  const at = start + moved;
  const last = count - 1;
  if (at < 0) return at * 0.35;
  if (at > last) return last + (at - last) * 0.35;
  return at;
}

// The book a released drag comes to rest on: where it stands, carried on by
// its speed (in covers a second, at most 30), within the books.
export function flowRest(offset: number, speed: number, count: number): number {
  const carried = offset + Math.max(-30, Math.min(30, speed)) * 0.2;
  return Math.max(0, Math.min(count - 1, Math.round(carried)));
}

// One step of `seconds` of the spring that brings the flow to `to`, from
// `offset` at `speed`, with no bounce (critically damped). `done` once it is
// there and still.
const stiffness = 110;
const damping = 2 * Math.sqrt(stiffness);

export function flowSpring(offset: number, speed: number, to: number, seconds: number): { offset: number; speed: number; done: boolean } {
  const pull = -stiffness * (offset - to) - damping * speed;
  const next = speed + pull * seconds;
  const at = offset + next * seconds;
  if (Math.abs(at - to) < 0.0015 && Math.abs(next) < 0.02) return { offset: to, speed: 0, done: true };
  return { offset: at, speed: next, done: false };
}
