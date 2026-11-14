// The Home screen, a Preact island (ADR 0014): the books the reader owns and
// has not read, then the books being read. A section with nothing to show is
// hidden; with every section empty, one line sends the reader to Check a book.
// The rules are in src/lib/library/home.ts; this file only renders them.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { openOwnSpace } from '../lib/auth/server-client';
import type { Edition } from '../lib/catalog/catalog';
import { lookupEditions } from '../lib/catalog/client';
import { reportNetwork, reportWaiting } from '../lib/connection';
import { pageLanguage, t } from '../lib/i18n/i18n';
import { libraryBooks, volumeLine, type LibraryBook } from '../lib/library/browse';
import { ownedUnread, readingNow } from '../lib/library/home';
import { loadLibrary, waitingCount } from '../lib/library/library';
import { bookHref, type Library } from '../lib/library/model';
import { isNetworkFailure } from '../lib/network';
import { freshListing } from '../lib/space/fresh-listing';
import { spaceErrorMessage, type Space } from '../lib/space/space';
import { toast } from '../lib/toast';
import { Cover } from './Cover';

// Where the screen reads from: the reader's Library store and the Catalog.
export interface Sources {
  // Undefined when signed out.
  open(): Promise<Space | undefined>;
  editions(isbns: string[]): Promise<Map<string, Edition>>;
}

const live: Sources = {
  open: async () => (await openOwnSpace())?.space,
  editions: lookupEditions,
};

export default function HomeIsland() {
  return <Home sources={live} />;
}

export function Home({ sources }: { sources: Sources }) {
  const [library, setLibrary] = useState<Library>();
  // In place of the sections when there is none to show (signed out, or the first read failed).
  const [message, setMessage] = useState<string>();
  // Catalog answers kept for this visit, so an offline reload keeps the titles.
  const editions = useRef(new Map<string, Edition>());
  const loaded = useRef(false);

  useEffect(() => {
    // No network: the connection status says it, and the listing tries again.
    function fail(error: unknown) {
      const network = isNetworkFailure(error);
      if (network) reportNetwork(false);
      if (!loaded.current) setMessage(spaceErrorMessage(error));
      else if (!network) toast(spaceErrorMessage(error), { error: true });
    }

    async function start() {
      const own = await sources.open();
      // No session: the gate (AppShell) is sending the visitor to the sign-in screen.
      if (!own) return;
      const listing = freshListing(
        async () => {
          const read = await loadLibrary(own);
          await askCatalog(read.library);
          return { ...read, waiting: await waitingCount(own) };
        },
        (read) => {
          // Stale: the store did not answer, so this is the copy on this device.
          reportNetwork(!read.stale);
          reportWaiting(read.waiting);
          loaded.current = true;
          setMessage(undefined);
          setLibrary(read.library);
        },
        fail,
      );
      await listing.refresh();
    }

    // The Editions of the Copies and Reading Statuses, when not asked yet.
    async function askCatalog(read: Library) {
      const isbns = [...read.copies, ...read.readingStatuses].map(({ value }) => value.isbn);
      const unknown = isbns.filter((isbn) => !editions.current.has(isbn));
      for (const [isbn, edition] of await sources.editions(unknown)) editions.current.set(isbn, edition);
    }

    start().catch(fail);
  }, [sources]);

  const sections = useMemo(() => {
    if (!library) return undefined;
    const books = libraryBooks(library, editions.current, []);
    return [
      { id: 'home-owned-unread', title: t('home.owned-unread'), books: ownedUnread(books, library, pageLanguage()) },
      { id: 'home-reading', title: t('home.reading'), books: readingNow(books, library, pageLanguage()) },
    ].filter((section) => section.books.length > 0);
  }, [library]);

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
