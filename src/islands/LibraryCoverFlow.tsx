// The Library in Cover flow mode: one book in front, the covers on each side.
// Desktop: the covers nearby, and Previous, Next and a slider to move. Phone:
// every cover in a strip the reader swipes, which snaps on a cover (CORE-106).
// It starts in the middle; the Library keeps the move, for the way back from
// a Book (CORE-96).
// Every cover links to its Book page; one on the side comes to the front first.
// Which book stands in front: src/lib/library/flow.ts.
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { t } from '../lib/i18n/i18n';
import { volumeLine, type LibraryBook } from '../lib/library/browse';
import { flowMove, flowNearest, flowPosition, flowStand, type FlowMove } from '../lib/library/flow';
import { bookHref } from '../lib/library/model';
import { Cover } from './Cover';

// Desktop: how many covers show on each side of the one in front.
const nearby = 4;
// Phone: a swipe has ended once the strip has not scrolled for this long.
const settleMs = 100;
// How far a cover on the side turns, as on desktop (src/pages/library.astro).
const turnDeg = 58;

export function LibraryCoverFlow({ books, moved, onMove, wide }: { books: LibraryBook[]; moved: FlowMove | undefined; onMove: (moved: FlowMove) => void; wide: boolean }) {
  const position = flowPosition(books, moved);
  const strip = useStrip(wide, position, books.length, (to) => onMove(flowMove(books, to)));
  const book = books.at(position);
  if (!book) return null;

  const last = books.length - 1;
  const move = (to: number) => onMove(flowMove(books, to));
  // Phone: every cover, for the strip. Desktop: the covers nearby.
  const first = wide ? Math.max(0, position - nearby) : 0;
  const shown = wide ? books.slice(first, position + nearby + 1) : books;
  // "One Piece, Volume 9": the Volumes of a Series share its title. A book
  // read with no Copy says so, as its grey cover does.
  const notOwned = (each: LibraryBook) => (each.owned ? '' : t('library.not-owned'));
  const named = (each: LibraryBook) => [each.title, volumeLine(each), notOwned(each)].filter(Boolean).join(', ');

  return (
    <div class="library-flow">
      <div ref={strip} class={wide ? 'library-flow-stage' : 'library-flow-stage library-flow-strip'}>
        {shown.map((each, at) => {
          const offset = first + at - position;
          return (
            // Desktop: the covers on the sides are a shortcut for a pointer, the
            // keyboard has Previous, Next and the slider. Phone: every cover
            // takes the focus, which scrolls it into the strip.
            <a
              key={each.work}
              class={each.owned ? 'library-flow-cover' : 'library-flow-cover library-not-owned'}
              href={bookHref(each.work)}
              style={wide ? `--side: ${Math.sign(offset)}; --away: ${Math.abs(offset)}` : undefined}
              aria-current={offset === 0}
              aria-label={named(each)}
              tabIndex={wide && offset !== 0 ? -1 : 0}
              onClick={(event) => {
                if (offset === 0) return;
                event.preventDefault();
                move(first + at);
              }}
            >
              <Cover class="library-flow-face" src={each.cover} title={each.title} series={each.series} volumeTitle={each.volumeTitle} volume={volumeLine(each)} />
            </a>
          );
        })}
      </div>

      <div class="library-flow-info" aria-live="polite">
        <span class="library-flow-position">{t('library.flow.position', position + 1, books.length)}</span>
        <a class="library-flow-title" href={bookHref(book.work)}>
          {book.title}
        </a>
        <span>{[volumeLine(book), book.volumeTitle].filter(Boolean).join(' · ')}</span>
        <span class="library-flow-line">{[book.authors.join(', '), t(`status.${book.status}`), notOwned(book)].filter(Boolean).join(' · ')}</span>
      </div>

      {wide && (
        <div class="library-flow-controls">
          {/* At an end the button stays in reach (`aria-disabled`): `disabled` would drop the focus of the keyboard. */}
          <button class="button" type="button" aria-disabled={position === 0} onClick={() => move(position - 1)}>
            {t('library.flow.previous')}
          </button>
          {/* The slider counts from 1, as the position above it does. */}
          <input type="range" aria-label={t('library.flow.browse')} min={1} max={books.length} value={position + 1} onInput={(event) => move(event.currentTarget.valueAsNumber - 1)} />
          <button class="button" type="button" aria-disabled={position === last} onClick={() => move(position + 1)}>
            {t('library.flow.next')}
          </button>
        </div>
      )}
    </div>
  );
}

// The place of the cover nearest the middle of the strip.
function nearest(strip: HTMLElement): number {
  const middles = [...strip.children].map((cover) => (cover as HTMLElement).offsetLeft + (cover as HTMLElement).offsetWidth / 2);
  return flowNearest(middles, strip.scrollLeft + strip.clientWidth / 2);
}

// Phone: each cover turns and stacks by how far it is from the middle of the
// strip, as the reader swipes (src/lib/library/flow.ts). The transform is on
// the face, not on the link: the link is the snap target, and WebKit snaps on
// the transformed box. A tap lands on the face the reader sees (library.astro).
function stand(strip: HTMLElement) {
  const middle = strip.scrollLeft + strip.clientWidth / 2;
  const covers = [...strip.children] as HTMLElement[];
  const step = covers.length > 1 ? covers[1].offsetLeft - covers[0].offsetLeft : 1;
  for (const cover of covers) {
    const width = cover.offsetWidth;
    const offset = (cover.offsetLeft + width / 2 - middle) / step;
    const { shift, turn, scale } = flowStand(offset);
    (cover.firstElementChild as HTMLElement).style.transform = `translateX(${(shift * width - offset * step).toFixed(1)}px) perspective(1100px) rotateY(${(-turn * turnDeg).toFixed(1)}deg) scale(${scale.toFixed(3)})`;
    cover.style.zIndex = String(1000 - Math.round(Math.abs(offset) * 10));
  }
}

// Phone: the strip scrolls to the cover in front (at once when it is drawn,
// so the way back from a Book and the cover flight find it in sight; then as
// the browser scrolls, smooth unless the reader asks for less motion), the
// covers turn as it scrolls, and the cover it snaps on after a swipe comes to
// the front.
function useStrip(wide: boolean, position: number, count: number, snapped: (to: number) => void) {
  const strip = useRef<HTMLDivElement>(null);
  const drawn = useRef(false);
  const latest = useRef({ position, snapped });
  latest.current = { position, snapped };

  useLayoutEffect(() => {
    const element = strip.current;
    if (wide || !element) {
      drawn.current = false;
      return;
    }
    const cover = element.children[position] as HTMLElement | undefined;
    if (cover && nearest(element) !== position) {
      element.scrollTo({ left: cover.offsetLeft + cover.offsetWidth / 2 - element.clientWidth / 2, behavior: drawn.current ? 'auto' : 'instant' });
    }
    drawn.current = true;
    // Not on every render: a Library read again during a swipe must not pull the strip back.
  }, [wide, position, count]);

  // After every render: other books can stand in the same places.
  useLayoutEffect(() => {
    if (!wide && strip.current) stand(strip.current);
  });

  useEffect(() => {
    const element = strip.current;
    if (wide || !element) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    const settle = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => stand(element));
      clearTimeout(timer);
      timer = setTimeout(() => {
        const to = nearest(element);
        if (to !== latest.current.position) latest.current.snapped(to);
      }, settleMs);
    };
    element.addEventListener('scroll', settle, { passive: true });
    // A turned phone or a new width: the covers change size.
    const resized = new ResizeObserver(() => stand(element));
    resized.observe(element);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      resized.disconnect();
      element.removeEventListener('scroll', settle);
    };
  }, [wide]);

  return strip;
}
