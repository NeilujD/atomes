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

// Phone: the place of the cover a swipe stops on, the one whose middle is
// nearest `middle`, the middle of the strip. `middles`: where each cover's
// middle is, in order.
export function flowNearest(middles: number[], middle: number): number {
  let nearest = 0;
  middles.forEach((each, at) => {
    if (Math.abs(each - middle) < Math.abs(middles[nearest] - middle)) nearest = at;
  });
  return nearest;
}
