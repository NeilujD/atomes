// The Library in List mode: the books under letters, and the A to Z index
// that jumps to a letter. The rules are in src/lib/library/letters.ts.
import { t } from '../lib/i18n/i18n';
import type { LibraryBook } from '../lib/library/browse';
import { otherLetters, type Listed } from '../lib/library/letters';
import { bookHref } from '../lib/library/model';
import { Cover } from './Cover';

// "#" reads badly aloud.
const spoken = (letter: string | null) => (letter === otherLetters ? t('library.other-letters') : undefined);

// The A to Z index, in the toolbar: a row of letters on desktop, a rail on the
// right edge on the phone. A letter with no book is off.
export function LetterIndex({ index }: Pick<Listed, 'index'>) {
  if (index.length === 0) return null;
  return (
    <nav class="library-index" aria-label={t('library.index')}>
      {index.map(({ letter, target }) => (
        <button key={letter} type="button" disabled={!target} aria-label={spoken(letter)} onClick={(event) => target && jump(event.currentTarget, target)}>
          {letter}
        </button>
      ))}
    </nav>
  );
}

// Shows the group of a letter and moves the focus there, so the next Tab is
// its first book. No smooth scroll: nothing to turn off for reduced motion.
function jump(from: HTMLElement, target: string) {
  const group = document.getElementById(target);
  const toolbar = from.closest<HTMLElement>('.library-toolbar');
  if (!group || !toolbar) return;
  // Desktop: the toolbar sticks to the top of the panel, so the group stops under it.
  const { position, top } = getComputedStyle(toolbar);
  group.style.scrollMarginTop = position === 'sticky' ? `${toolbar.offsetHeight + parseFloat(top)}px` : '';
  group.scrollIntoView();
  group.focus({ preventScroll: true });
}

export function LibraryList({ groups }: Pick<Listed, 'groups'>) {
  return (
    <div class="library-list">
      {groups.map(({ letter, target, books }) => (
        <section key={target} id={target} class="library-group" aria-labelledby={`${target}-title`} tabIndex={-1}>
          <h2 id={`${target}-title`} class="library-letter" aria-label={spoken(letter)}>
            {letter ?? t('library.sort.added')}
          </h2>
          <ul>
            {books.map((book) => (
              <Row key={book.work} book={book} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Row({ book }: { book: LibraryBook }) {
  const volume = book.volume ? t('book.volume', book.volume) : '';
  const line = [volume, book.volumeTitle].filter(Boolean).join(' · ');
  return (
    <li>
      <a class="library-row" href={bookHref(book.work)}>
        <Cover class="library-row-cover" src={book.cover} title={book.title} series={book.series} volumeTitle={book.volumeTitle} volume={volume} />
        <span class="library-row-main">
          <span class="library-row-title">{book.title}</span>
          {line && <span class="library-row-line">{line}</span>}
        </span>
        <span class="library-row-author">{book.authors.join(', ')}</span>
        <span class="library-row-status">{t(`status.${book.status}`)}</span>
      </a>
    </li>
  );
}
