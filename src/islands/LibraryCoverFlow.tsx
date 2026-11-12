// The Library in Cover flow mode: one book in front, the covers nearby on each
// side, and Previous, Next and a slider to move. It starts in the middle.
// Every cover links to its Book page; one on the side comes to the front first.
import { useState } from 'preact/hooks';
import { t } from '../lib/i18n/i18n';
import type { LibraryBook } from '../lib/library/browse';
import { bookHref } from '../lib/library/model';
import { Cover } from './Cover';

// How many covers show on each side of the one in front.
const nearby = 4;

export function LibraryCoverFlow({ books }: { books: LibraryBook[] }) {
  // Where the reader moved to, in which books. Other books (a search, a
  // filter, another sort): the flow starts again in the middle.
  const works = books.map(({ work }) => work).join(' ');
  const [moved, setMoved] = useState<{ to: number; works: string }>();
  const position = moved?.works === works ? moved.to : Math.floor(books.length / 2);
  const book = books.at(position);
  if (!book) return null;

  const last = books.length - 1;
  const move = (to: number) => setMoved({ to: Math.min(Math.max(to, 0), last), works });
  const first = Math.max(0, position - nearby);
  const volume = (each: LibraryBook) => (each.volume ? t('book.volume', each.volume) : '');
  // "One Piece, Volume 9": the Volumes of a Series share its title.
  const named = (each: LibraryBook) => [each.title, volume(each)].filter(Boolean).join(', ');

  return (
    <div class="library-flow">
      <div class="library-flow-stage">
        {books.slice(first, position + nearby + 1).map((each, at) => {
          const offset = first + at - position;
          return (
            // The covers on the sides are a shortcut for a pointer: the keyboard has Previous, Next and the slider.
            <a
              key={each.work}
              class="library-flow-cover"
              href={bookHref(each.work)}
              style={`--side: ${Math.sign(offset)}; --away: ${Math.abs(offset)}`}
              aria-current={offset === 0}
              aria-label={named(each)}
              tabIndex={offset === 0 ? 0 : -1}
              onClick={(event) => {
                if (offset === 0) return;
                event.preventDefault();
                move(first + at);
              }}
            >
              <Cover class="library-flow-face" src={each.cover} title={each.title} series={each.series} volumeTitle={each.volumeTitle} volume={volume(each)} />
            </a>
          );
        })}
      </div>

      <div class="library-flow-info" aria-live="polite">
        <span class="library-flow-position">{t('library.flow.position', position + 1, books.length)}</span>
        <a class="library-flow-title" href={bookHref(book.work)}>
          {book.title}
        </a>
        <span>{[volume(book), book.volumeTitle].filter(Boolean).join(' · ')}</span>
        <span class="library-flow-line">{[book.authors.join(', '), t(`status.${book.status}`)].filter(Boolean).join(' · ')}</span>
      </div>

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
    </div>
  );
}
