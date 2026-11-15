// The Library in Cover flow mode: one book in front, the covers on each side,
// turned and stacked. The reader drags the covers with a finger or the mouse;
// they follow it, and on release come to rest on a cover with a spring, carried
// on by the speed of the drag (CORE-106). No native scroll: every cover is
// placed from here, in the same frame as the finger, so nothing lags behind.
// A tap on a side cover brings it to the front; a tap on the front one opens
// its Book page. Desktop also has Previous, Next and a slider; the keyboard
// has them and the arrow keys. The Library keeps the move, for the way back
// from a Book (CORE-96).
// How each cover stands, the drag and the spring: src/lib/library/flow.ts.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t } from '../lib/i18n/i18n';
import { volumeLine, type LibraryBook } from '../lib/library/browse';
import { flowDrag, flowMove, flowPosition, flowRest, flowSpring, flowStand, type FlowMove } from '../lib/library/flow';
import { bookHref } from '../lib/library/model';
import { Cover } from './Cover';

// How far a cover on the side turns.
const tiltDeg = 62;
// A drag of this share of a cover's width moves the flow by one cover.
const dragShare = 0.44;
// A press becomes a drag past this many pixels across.
const dragStart = 8;
// A release this long after the last move carries no speed.
const stillMs = 90;

export function LibraryCoverFlow({ books, moved, onMove, wide }: { books: LibraryBook[]; moved: FlowMove | undefined; onMove: (moved: FlowMove) => void; wide: boolean }) {
  const position = flowPosition(books, moved);
  const { stage, front, move } = useFlow(books, position, (to) => onMove(flowMove(books, to)));
  const book = books.at(front);
  if (!book) return null;

  const last = books.length - 1;
  // "One Piece, Volume 9": the Volumes of a Series share its title. A book
  // read with no Copy says so, as its grey cover does.
  const notOwned = (each: LibraryBook) => (each.owned ? '' : t('library.not-owned'));
  const named = (each: LibraryBook) => [each.title, volumeLine(each), notOwned(each)].filter(Boolean).join(', ');

  return (
    <div class="library-flow">
      <div
        ref={stage}
        class="library-flow-stage"
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          move(front + (event.key === 'ArrowLeft' ? -1 : 1));
        }}
      >
        <div class="library-flow-floor" aria-hidden="true" />
        {books.map((each, at) => (
          // The covers on the sides are a shortcut for a pointer; the keyboard
          // has the arrow keys (and on desktop Previous, Next and the slider).
          <a
            key={each.work}
            class={each.owned ? 'library-flow-cover' : 'library-flow-cover library-not-owned'}
            href={bookHref(each.work)}
            draggable={false}
            aria-current={at === front}
            aria-label={named(each)}
            tabIndex={at === front ? 0 : -1}
            onClick={(event) => {
              if (at === front) return;
              event.preventDefault();
              move(at);
            }}
          >
            <Cover class="library-flow-face" src={each.cover} title={each.title} series={each.series} volumeTitle={each.volumeTitle} volume={volumeLine(each)} />
            <span class="library-flow-shade" aria-hidden="true" />
          </a>
        ))}
      </div>

      <div class="library-flow-info" aria-live="polite">
        <span class="library-flow-position">{t('library.flow.position', front + 1, books.length)}</span>
        <a class="library-flow-title" href={bookHref(book.work)}>
          {book.title}
        </a>
        <span>{[volumeLine(book), book.volumeTitle].filter(Boolean).join(' · ')}</span>
        <span class="library-flow-line">{[book.authors.join(', '), t(`status.${book.status}`), notOwned(book)].filter(Boolean).join(' · ')}</span>
      </div>

      {wide ? (
        <div class="library-flow-controls">
          {/* At an end the button stays in reach (`aria-disabled`): `disabled` would drop the focus of the keyboard. */}
          <button class="button" type="button" aria-disabled={front === 0} onClick={() => move(front - 1)}>
            {t('library.flow.previous')}
          </button>
          {/* The slider counts from 1, as the position above it does. */}
          <input type="range" aria-label={t('library.flow.browse')} min={1} max={books.length} value={front + 1} onInput={(event) => move(event.currentTarget.valueAsNumber - 1)} />
          <button class="button" type="button" aria-disabled={front === last} onClick={() => move(front + 1)}>
            {t('library.flow.next')}
          </button>
        </div>
      ) : (
        // Phone: where the book in front stands in the Library, as a thumb on a track.
        <div class="library-flow-track" aria-hidden="true">
          <span style={`--flow-at: ${last > 0 ? front / last : 0}`} />
        </div>
      )}
    </div>
  );
}

// Places every cover for the flow standing at `offset` (a fraction while it
// moves); returns the book in front.
function paint(stage: HTMLElement, offset: number): number {
  const covers = stage.querySelectorAll<HTMLElement>('.library-flow-cover');
  const front = Math.max(0, Math.min(covers.length - 1, Math.round(offset)));
  const width = coverWidth(stage);
  covers.forEach((cover, at) => {
    const stand = flowStand(at - offset);
    if (stand.hidden) {
      if (cover.style.display !== 'none') cover.style.display = 'none';
      return;
    }
    cover.style.display = '';
    cover.style.transform = `translate3d(${(stand.x * width).toFixed(2)}px, 0, ${(stand.z * width).toFixed(2)}px) rotateY(${(-stand.turn * tiltDeg).toFixed(2)}deg)`;
    cover.style.zIndex = String(1000 - Math.round(Math.abs(at - offset) * 10));
    cover.style.opacity = stand.opacity.toFixed(3);
    (cover.lastElementChild as HTMLElement).style.opacity = stand.shade.toFixed(3);
  });
  return front;
}

// The width of a cover: every cover has it, but one far from the front is not
// drawn (no box), so it is read on the one in front.
function coverWidth(stage: HTMLElement): number {
  return stage.querySelector<HTMLElement>('.library-flow-cover[aria-current="true"]')?.offsetWidth || stage.querySelector<HTMLElement>('.library-flow-cover:not([style*="display: none"])')?.offsetWidth || 0;
}

interface Drag {
  pointer: number;
  x: number;
  y: number;
  start: number;
  lastX: number;
  lastTime: number;
  dragging: boolean;
}

// The motion of the flow: where it stands (`offset`), the drag, and the spring
// to the book it comes to rest on (`to`), which is the book the Library keeps
// (`position`, `commit`). `front` is the book the text, the slider and
// `aria-current` name: under the finger during a drag, else the book the flow
// goes to, at once (a screen reader hears where Next leads, not each cover
// passed on the way).
function useFlow(books: LibraryBook[], position: number, commit: (to: number) => void) {
  const stage = useRef<HTMLDivElement>(null);
  const [front, setFront] = useState(position);
  const motion = useRef({ offset: position, speed: 0, to: position, frame: 0, pending: 0, drag: null as Drag | null, swallowClick: false });
  const latest = useRef({ count: books.length, position, commit });
  latest.current = { count: books.length, position, commit };
  const works = books.map(({ work }) => work).join(' ');
  const shownWorks = useRef(works);

  const draw = () => {
    if (stage.current) paint(stage.current, motion.current.offset);
  };

  const animate = (to: number) => {
    const state = motion.current;
    cancelAnimationFrame(state.frame);
    state.to = to;
    setFront(to);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      state.offset = to;
      state.speed = 0;
      draw();
      return;
    }
    let before = performance.now();
    const step = (now: number) => {
      const seconds = Math.min((now - before) / 1000, 0.032);
      before = now;
      const next = flowSpring(state.offset, state.speed, to, seconds);
      state.offset = next.offset;
      state.speed = next.speed;
      draw();
      if (!next.done) state.frame = requestAnimationFrame(step);
    };
    state.frame = requestAnimationFrame(step);
  };

  // Comes to rest on `to` and keeps it.
  const move = (to: number) => {
    const at = Math.max(0, Math.min(books.length - 1, to));
    animate(at);
    if (at !== position) commit(at);
  };

  // Another place from outside (Previous, Next, the slider, the way back): the
  // flow goes there. Other books (a search, a filter, another sort): at once.
  // The same books read again during a drag change nothing.
  useLayoutEffect(() => {
    const state = motion.current;
    if (shownWorks.current !== works) {
      shownWorks.current = works;
      cancelAnimationFrame(state.frame);
      Object.assign(state, { offset: position, speed: 0, to: position });
      setFront(position);
      draw();
    } else if (state.to !== position && !state.drag?.dragging) {
      animate(position);
    }
  }, [position, works]);

  // After every render: new covers stand in their places before they show.
  useLayoutEffect(() => {
    if (stage.current) paint(stage.current, motion.current.offset);
  });

  // When the focus is on a cover, it follows the cover that comes to the front.
  useEffect(() => {
    const element = stage.current;
    if (element?.contains(document.activeElement)) element.querySelector<HTMLElement>('[aria-current="true"]')?.focus({ preventScroll: true });
  }, [front]);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const state = motion.current;

    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      state.swallowClick = false;
      cancelAnimationFrame(state.frame);
      state.speed = 0;
      state.drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, start: state.offset, lastX: event.clientX, lastTime: performance.now(), dragging: false };
    };

    const drag = (event: PointerEvent) => {
      const held = state.drag;
      if (!held || event.pointerId !== held.pointer) return;
      const across = event.clientX - held.x;
      if (!held.dragging) {
        if (Math.abs(across) < dragStart) return;
        // Up or down first: the page scrolls (touch-action: pan-y), the flow does not move.
        if (Math.abs(event.clientY - held.y) > Math.abs(across)) {
          release(event);
          return;
        }
        held.dragging = true;
        element.setPointerCapture(event.pointerId);
      }
      const step = (coverWidth(element) || 1) * dragShare;
      const now = performance.now();
      const elapsed = now - held.lastTime;
      if (elapsed > 0) state.speed = state.speed * 0.25 + (-(event.clientX - held.lastX) / step / elapsed) * 1000 * 0.75;
      held.lastX = event.clientX;
      held.lastTime = now;
      state.offset = flowDrag(held.start, -across / step, latest.current.count);
      if (!state.pending) {
        state.pending = requestAnimationFrame(() => {
          state.pending = 0;
          if (element) setFront(paint(element, state.offset));
        });
      }
    };

    // A drag comes to rest where its speed carries it; a press that was no
    // drag (a tap, or the page scrolling) lets the flow end its move.
    const release = (event: PointerEvent) => {
      const held = state.drag;
      if (!held || event.pointerId !== held.pointer) return;
      state.drag = null;
      if (!held.dragging) {
        animate(state.to);
        return;
      }
      // The click that ends a drag, when the browser sends one (at once, in
      // the same task), opens nothing; the next tap does.
      state.swallowClick = event.type === 'pointerup';
      setTimeout(() => (state.swallowClick = false));
      if (performance.now() - held.lastTime > stillMs) state.speed = 0;
      const to = flowRest(state.offset, state.speed, latest.current.count);
      animate(to);
      if (to !== latest.current.position) latest.current.commit(to);
    };

    const click = (event: MouseEvent) => {
      if (!state.swallowClick) return;
      state.swallowClick = false;
      event.preventDefault();
      event.stopPropagation();
    };
    // A mouse drag must not drag the link or its image away.
    const noDrag = (event: DragEvent) => event.preventDefault();

    element.addEventListener('pointerdown', down);
    element.addEventListener('pointermove', drag);
    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
    element.addEventListener('click', click, true);
    element.addEventListener('dragstart', noDrag);
    // A turned phone or a new width: the covers change size.
    const resized = new ResizeObserver(draw);
    resized.observe(element);
    return () => {
      cancelAnimationFrame(state.frame);
      cancelAnimationFrame(state.pending);
      resized.disconnect();
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointermove', drag);
      element.removeEventListener('pointerup', release);
      element.removeEventListener('pointercancel', release);
      element.removeEventListener('click', click, true);
      element.removeEventListener('dragstart', noDrag);
    };
  }, []);

  return { stage, front, move };
}
