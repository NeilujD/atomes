// The Home screen, a Preact island (ADR 0014): the books the reader owns and
// has not read, then the books being read, then a card with the numbers of
// the year that opens Statistics. A section with nothing to show is hidden;
// with nothing to show at all, a card sends the reader to Check a book, the
// main action of the screen (filled cobalt, Q7).
// The rules are in src/lib/library/home.ts; this file only renders them.
import { useMemo } from 'preact/hooks';
import { openOwnSpace } from '../lib/auth/server-client';
import { lookupEditions } from '../lib/catalog/client';
import { pageFormat, pageLanguage, t } from '../lib/i18n/i18n';
import { libraryBooks, volumeLine, type LibraryBook } from '../lib/library/browse';
import { ownedUnread, readingNow, yearCard, type YearCard } from '../lib/library/home';
import { bookHref } from '../lib/library/model';
import { Cover } from './Cover';
import { EmptyState } from './EmptyState';
import { useLibraryListing, type ListingSources } from './library-listing';

// Where the screen reads from: the reader's Library store and the Catalog.
export type Sources = ListingSources;

const live: Sources = {
  open: async () => (await openOwnSpace())?.space,
  editions: lookupEditions,
};

export default function HomeIsland() {
  return <Home sources={live} />;
}

export function Home({ sources }: { sources: Sources }) {
  const { read, message, editions } = useLibraryListing(sources);

  const home = useMemo(() => {
    if (!read) return undefined;
    const { library } = read;
    const books = libraryBooks(library, editions, []);
    return {
      sections: [
        { id: 'home-owned-unread', title: t('home.owned-unread'), books: ownedUnread(books, pageLanguage()) },
        { id: 'home-reading', title: t('home.reading'), books: readingNow(books, library, pageLanguage()) },
      ].filter((section) => section.books.length > 0),
      year: yearCard(library, editions, new Date(), pageLanguage()),
    };
  }, [read, editions]);

  if (message) {
    return (
      <div class="home">
        <p class="home-message" role="status">
          {message}
        </p>
      </div>
    );
  }
  if (!home) return <HomeSkeleton />;
  const { sections, year } = home;
  if (sections.length === 0 && !year) {
    return (
      <div class="home">
        <EmptyState text={t('home.empty')} action={t('nav.check-book')} href="/check" />
      </div>
    );
  }
  return (
    <div class="home">
      {sections.map((section) => (
        <section key={section.id} class="home-group" aria-labelledby={section.id}>
          <h2 class="small-heading" id={section.id}>
            {section.title}
          </h2>
          <ul class="home-grid">
            {section.books.map((book) => (
              <Book key={book.work} book={book} />
            ))}
          </ul>
        </section>
      ))}
      {year && <Year card={year} />}
    </div>
  );
}

// The phone tab bar has no place for Statistics: this card leads there. A
// plain link, so a tap works before the scripts run.
function Year({ card }: { card: YearCard }) {
  const format = pageFormat();
  return (
    <a class="card home-year" href="/statistics">
      <span class="home-year-title">
        <span class="small-heading">{t('home.year', card.year)}</span>
        <svg class="home-year-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </span>
      <dl class="home-year-numbers">
        <div>
          <dt>{t('stats.read')}</dt>
          <dd>{format(card.read)}</dd>
        </div>
        <div>
          <dt>{t('stats.added')}</dt>
          <dd>{format(card.added)}</dd>
        </div>
      </dl>
    </a>
  );
}

function Book({ book }: { book: LibraryBook }) {
  const volume = volumeLine(book);
  const line = [volume, book.authors.join(', ')].filter(Boolean).join(' · ');
  return (
    <li>
      <a class="home-book" href={bookHref(book.work)}>
        <Cover class="home-cover" src={book.cover} title={book.title} series={book.series} volumeTitle={book.volumeTitle} volume={volume} />
        <span class="home-book-title">{book.title}</span>
        {line && <span class="home-book-line">{line}</span>}
      </a>
    </li>
  );
}

// While the Library loads; also the page's fallback before the island starts.
export function HomeSkeleton() {
  return (
    <div class="home" aria-busy="true">
      <ul class="home-grid" aria-hidden="true">
        {Array.from({ length: 6 }, (_, each) => (
          <li key={each}>
            <div class="book-cover home-cover skeleton" />
          </li>
        ))}
      </ul>
    </div>
  );
}
