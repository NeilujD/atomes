// The Home screen, a Preact island (ADR 0014): the books the reader owns and
// has not read, then the books being read. A section with nothing to show is
// hidden; with every section empty, one line sends the reader to Check a book.
// The rules are in src/lib/library/home.ts; this file only renders them.
import { useMemo } from 'preact/hooks';
import { openOwnSpace } from '../lib/auth/server-client';
import { lookupEditions } from '../lib/catalog/client';
import { pageLanguage, t } from '../lib/i18n/i18n';
import { libraryBooks, volumeLine, type LibraryBook } from '../lib/library/browse';
import { ownedUnread, readingNow } from '../lib/library/home';
import { bookHref } from '../lib/library/model';
import { Cover } from './Cover';
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

  const sections = useMemo(() => {
    if (!read) return undefined;
    const { library } = read;
    const books = libraryBooks(library, editions, []);
    return [
      { id: 'home-owned-unread', title: t('home.owned-unread'), books: ownedUnread(books, pageLanguage()) },
      { id: 'home-reading', title: t('home.reading'), books: readingNow(books, library, pageLanguage()) },
    ].filter((section) => section.books.length > 0);
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
  if (!sections) return <HomeSkeleton />;
  if (sections.length === 0) {
    return (
      <div class="home">
        <p class="home-message">
          {t('home.empty')} <a href="/check">{t('nav.check-book')}</a>
        </p>
      </div>
    );
  }
  return (
    <div class="home">
      {sections.map((section) => (
        <section key={section.id} class="home-group" aria-labelledby={section.id}>
          <h2 class="home-group-title" id={section.id}>
            {section.title}
          </h2>
          <ul class="home-grid">
            {section.books.map((book) => (
              <Book key={book.work} book={book} />
            ))}
          </ul>
        </section>
      ))}
    </div>
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
