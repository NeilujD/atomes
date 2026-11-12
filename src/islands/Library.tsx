// The Library screen, a Preact island (ADR 0014): every book in Grid, List
// (LibraryList.tsx) or Cover flow (LibraryCoverFlow.tsx), under one toolbar
// (search, Search in, Sort, filters, count, Clear all, the Books / Series
// switch and the mode switch).
// On the phone the controls open in a sheet.
// The rules are in src/lib/library/browse.ts; this file only renders them.
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { openOwnSpace } from '../lib/auth/server-client';
import type { Edition } from '../lib/catalog/catalog';
import { coverUrl, lookupEditions } from '../lib/catalog/client';
import { reportNetwork, reportWaiting } from '../lib/connection';
import { pageLanguage, t } from '../lib/i18n/i18n';
import { allBooks, browse, clearAll, libraryBooks, liveQuery, volumeLine, type Browsed, type LibraryBook, type LibraryQuery, type SearchIn, type SortBy } from '../lib/library/browse';
import { listLabels, type Label } from '../lib/library/label';
import { letterGroups } from '../lib/library/letters';
import { loadLibrary, waitingCount } from '../lib/library/library';
import { groupings, modes, readGrouping, readMode, saveGrouping, saveMode, type Grouping, type Mode } from '../lib/library/mode';
import { bookHref, type Library as LibraryRecords } from '../lib/library/model';
import type { Saved } from '../lib/library/records';
import { seriesHref } from '../lib/library/series';
import { librarySeries, seriesCards, type LibrarySeries } from '../lib/library/series-mode';
import { isNetworkFailure } from '../lib/network';
import { freshListing } from '../lib/space/fresh-listing';
import { spaceErrorMessage, type Space } from '../lib/space/space';
import { toast } from '../lib/toast';
import { Cover } from './Cover';
import { LibraryCoverFlow } from './LibraryCoverFlow';
import { LetterIndex, LibraryList } from './LibraryList';

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

export default function LibraryIsland() {
  return <Library sources={live} />;
}

// The phone frame ends at 960 px (docs/design/ui-direction.md).
const desktop = '(min-width: 960px)';

export function Library({ sources }: { sources: Sources }) {
  const [read, setRead] = useState<{ library: LibraryRecords; labels: Saved<Label>[] }>();
  // In place of the grid when there is none to show (signed out, or the first read failed).
  const [message, setMessage] = useState<string>();
  const [asked, setQuery] = useState<LibraryQuery>(allBooks);
  const [grouping, setGrouping] = useState<Grouping>(readGrouping);
  const [mode, setMode] = useState<Mode>(readMode);
  const wide = useMedia(desktop);
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
          const [records, labels] = await Promise.all([loadLibrary(own), listLabels(own)]);
          await askCatalog(records.library);
          return { library: records.library, labels: labels.records, stale: records.stale || labels.stale, waiting: await waitingCount(own) };
        },
        (fresh) => {
          // Stale: the store did not answer, so this is the copy on this device.
          reportNetwork(!fresh.stale);
          reportWaiting(fresh.waiting);
          loaded.current = true;
          setMessage(undefined);
          setRead({ library: fresh.library, labels: fresh.labels });
        },
        fail,
      );
      await listing.refresh();
    }

    // The Editions of the Copies and Reading Statuses, when not asked yet. One
    // the Catalog cannot answer for now shows its ISBN, and is asked again on the next read.
    async function askCatalog(library: LibraryRecords) {
      const isbns = [...library.copies, ...library.readingStatuses].map(({ value }) => value.isbn);
      const unknown = isbns.filter((isbn) => !editions.current.has(isbn));
      for (const [isbn, edition] of await sources.editions(unknown)) editions.current.set(isbn, edition);
    }

    start().catch(fail);
  }, [sources]);

  const books = useMemo(() => read && libraryBooks(read.library, editions.current, read.labels), [read]);
  const series = useMemo(() => read && books && librarySeries(books, read.library, editions.current), [read, books]);

  if (message) {
    return (
      <div class="library">
        <p class="library-message" role="status">
          {message}
        </p>
      </div>
    );
  }
  if (!read || !books || !series) return <LibrarySkeleton />;
  if (books.length === 0) {
    return (
      <div class="library">
        <p class="library-message">{t('library.empty')}</p>
        <a class="button button-primary library-add" href="/check">
          {t('book.add-a-book')}
        </a>
      </div>
    );
  }

  // What the reader asked for, less a Label deleted since: the badge, the chips and the books read one query.
  const query = liveQuery(asked, read.labels);
  const found = browse(books, read.labels, query, pageLanguage());
  // Grid, List or Cover flow is for Books. Series show as a grid of cards, with
  // no mode switch and no letter index; the mode is kept for the way back.
  const byBooks = grouping === 'books';
  const listed = byBooks && mode === 'list' ? letterGroups(found.books, query.sort, pageLanguage()) : undefined;
  const modeSwitch = byBooks && (
    <Segmented
      name="library-mode"
      label={t('library.mode')}
      choices={modes}
      chosen={mode}
      text={(each) => t(`library.mode.${each}`)}
      onChange={(chosen) => {
        saveMode(chosen);
        setMode(chosen);
      }}
    />
  );
  const change = (part: Partial<LibraryQuery>) => setQuery({ ...query, ...part });
  const clear = () => setQuery(clearAll(query));
  const count = (
    <p class="library-count" role="status">
      {t('library.count', found.books.length, found.total, found.filtered)}
    </p>
  );
  const clearButton = found.filtered && (
    <button class="button button-quiet library-clear" type="button" onClick={clear}>
      {t('library.clear-all')}
    </button>
  );
  // Books / Series: kept on the device, so the Library opens the way the reader left it.
  const group = (chosen: Grouping) => {
    saveGrouping(chosen);
    setGrouping(chosen);
  };
  const groupingSwitch = <Segmented name="library-grouping" label={t('library.grouping')} choices={groupings} chosen={grouping} text={(each) => t(`library.grouping.${each}`)} onChange={group} />;
  const cards = grouping === 'series' && seriesCards(found.books, series, query.sort, pageLanguage());

  return (
    <div class="library">
      <div class="library-toolbar">
        {!wide && groupingSwitch}
        {!wide && modeSwitch}
        <div class="library-search-row">
          <div class="library-search">
            <label class="visually-hidden" for="library-search">
              {t('library.search')}
            </label>
            <input
              class="field"
              id="library-search"
              type="search"
              autoComplete="off"
              placeholder={t('library.search-placeholder')}
              value={query.text}
              onInput={(event) => change({ text: event.currentTarget.value })}
            />
          </div>
          {wide ? (
            <>
              {groupingSwitch}
              {count}
              {clearButton}
              {modeSwitch}
            </>
          ) : (
            <Sheet query={query} found={found} change={change} />
          )}
        </div>
        {wide ? (
          <Controls query={query} found={found} change={change} />
        ) : (
          <div class="library-count-row">
            {count}
            {clearButton}
          </div>
        )}
        {listed && <LetterIndex index={listed.index} />}
      </div>

      {found.books.length === 0 ? (
        <div class="library-no-match">
          <p>{t('library.no-match')}</p>
          <button class="button" type="button" onClick={clear}>
            {t('library.clear-all')}
          </button>
        </div>
      ) : cards ? (
        <ul class="library-grid">
          {cards.map((card) => ('series' in card ? <SeriesCard key={`series ${card.series.cover.isbn}`} series={card.series} /> : <Book key={card.book.work} book={card.book} />))}
        </ul>
      ) : listed ? (
        <LibraryList groups={listed.groups} />
      ) : mode === 'flow' ? (
        <LibraryCoverFlow books={found.books} />
      ) : (
        <ul class="library-grid">
          {found.books.map((book) => (
            <Book key={book.work} book={book} />
          ))}
        </ul>
      )}
    </div>
  );
}

interface ControlsProps {
  query: LibraryQuery;
  found: Browsed;
  change: (part: Partial<LibraryQuery>) => void;
}

const searchIns: SearchIn[] = ['all', 'title', 'author', 'series', 'volumeTitle'];
const sorts: SortBy[] = ['title', 'author', 'series', 'added'];

// Search in, Sort, the author and Series filters, and the chips: in the
// toolbar on desktop, in the sheet on the phone.
function Controls({ query, found, change }: ControlsProps) {
  return (
    <div class="library-controls">
      <div class="library-selects">
        <Select id="library-search-in" label={t('library.search-in')} value={query.searchIn} onChange={(value) => change({ searchIn: value as SearchIn })}>
          {searchIns.map((each) => (
            <option key={each} value={each}>
              {t(`library.search-in.${each}`)}
            </option>
          ))}
        </Select>
        <Select id="library-sort" label={t('library.sort')} value={query.sort} onChange={(value) => change({ sort: value as SortBy })}>
          {sorts.map((each) => (
            <option key={each} value={each}>
              {t(`library.sort.${each}`)}
            </option>
          ))}
        </Select>
        <Select id="library-author" label={t('library.author')} value={query.author ?? ''} onChange={(value) => change({ author: value || null })}>
          <option value="">{t('library.any-author')}</option>
          {found.authors.map((each) => (
            <option key={each} value={each}>
              {each}
            </option>
          ))}
        </Select>
        <Select id="library-series" label={t('library.series')} value={query.series ?? ''} onChange={(value) => change({ series: value || null })}>
          <option value="">{t('library.any-series')}</option>
          {found.series.map((each) => (
            <option key={each} value={each}>
              {each}
            </option>
          ))}
        </Select>
      </div>
      <div class="library-chips" role="group" aria-label={t('library.status')}>
        {found.statuses.map(({ status, count }) => (
          <Chip key={status ?? 'all'} name={status ? t(`status.${status}`) : t('library.all-statuses')} count={count} pressed={query.status === status} onClick={() => change({ status })} />
        ))}
      </div>
      {/* Labels are made on the Book page (CORE-35); with none, no row. */}
      {found.labels.length > 1 && (
        <div class="library-chips" role="group" aria-label={t('library.label')}>
          {found.labels.map(({ label, name, count }) => (
            <Chip key={label ?? 'all'} name={label ? name : t('library.all-labels')} count={count} pressed={query.label === label} onClick={() => change({ label })} />
          ))}
        </div>
      )}
    </div>
  );
}

// The phone: one button opens the controls in a sheet; it shows how many are on.
function Sheet({ query, found, change }: ControlsProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const on = [query.searchIn !== 'all', query.author, query.series, query.status, query.label].filter(Boolean).length;
  return (
    <>
      <button class="button library-filters" type="button" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
        <span>{t('library.filters')}</span>
        {on > 0 && (
          <span class="library-badge">
            <span aria-hidden="true">{on}</span>
            <span class="visually-hidden">{t('library.filters-on', on)}</span>
          </span>
        )}
      </button>
      {/* A tap on the backdrop closes it, as Escape does. */}
      <dialog
        ref={dialog}
        class="library-sheet"
        aria-label={t('library.filters')}
        onClick={(event) => event.target === event.currentTarget && event.currentTarget.close()}
      >
        <Controls query={query} found={found} change={change} />
        <button class="button button-primary library-show" type="button" onClick={() => dialog.current?.close()}>
          {t('library.show', found.books.length)}
        </button>
      </dialog>
    </>
  );
}

function Select({ id, label, value, onChange, children }: { id: string; label: string; value: string; onChange: (value: string) => void; children: ComponentChildren }) {
  return (
    <div class="library-select">
      <label for={id}>{label}</label>
      <select class="field" id={id} value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        {children}
      </select>
    </div>
  );
}

function Chip({ name, count, pressed, onClick }: { name: string; count: number; pressed: boolean; onClick: () => void }) {
  return (
    <button class="library-chip" type="button" aria-pressed={pressed} onClick={onClick}>
      <span class="library-chip-name">{name}</span>
      <span class="library-chip-count">{count}</span>
    </button>
  );
}

// One choice among a few: the Books / Series switch and the Grid / List / Cover
// flow switch. Desktop: in the search row. Phone: each a row of its own.
function Segmented<Choice extends string>({
  name,
  label,
  choices,
  chosen,
  text,
  onChange,
}: {
  name: string;
  label: string;
  choices: readonly Choice[];
  chosen: Choice;
  text: (choice: Choice) => string;
  onChange: (choice: Choice) => void;
}) {
  return (
    <div class="segmented library-switch" role="radiogroup" aria-label={label}>
      {choices.map((each) => (
        <label key={each} class="segment">
          <input type="radio" name={name} value={each} checked={chosen === each} onChange={() => onChange(each)} />
          <span>{text(each)}</span>
        </label>
      ))}
    </div>
  );
}

function Book({ book }: { book: LibraryBook }) {
  const volume = volumeLine(book);
  const line = [volume, book.authors.join(', ')].filter(Boolean).join(' · ');
  return (
    <li>
      <a class="library-book" href={bookHref(book.work)}>
        <Cover class="library-cover" src={book.cover} title={book.title} series={book.series} volumeTitle={book.volumeTitle} volume={volume} />
        <span class="library-book-title">{book.title}</span>
        {line && <span class="library-book-line">{line}</span>}
      </a>
    </li>
  );
}

// Series mode: the Series in place of its books; it opens the Series page.
function SeriesCard({ series }: { series: LibrarySeries }) {
  const { cover } = series;
  return (
    <li>
      <a class="library-book" href={seriesHref(cover.isbn)}>
        <Cover
          class="library-cover"
          src={coverUrl(cover)}
          title={cover.title}
          series={series.title}
          volumeTitle={cover.volumeTitle}
          volume={cover.volumes.length > 0 ? t('book.volumes', cover.volumes) : ''}
        />
        <span class="library-book-title">{series.title}</span>
        <span class="library-book-line">{t('library.series-counts', series.owned, series.read)}</span>
      </a>
    </li>
  );
}

// Follows a media query, so the toolbar and the sheet swap when the window crosses it.
function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const list = matchMedia(query);
    const update = () => setMatches(list.matches);
    list.addEventListener('change', update);
    update();
    return () => list.removeEventListener('change', update);
  }, [query]);
  return matches;
}

// While the Library loads; also the page's fallback before the island starts.
export function LibrarySkeleton() {
  return (
    <div class="library" aria-busy="true">
      <ul class="library-grid" aria-hidden="true">
        {Array.from({ length: 12 }, (_, each) => (
          <li key={each}>
            <div class="book-cover library-cover skeleton" />
          </li>
        ))}
      </ul>
    </div>
  );
}
