// The Library screen, a Preact island (ADR 0014): every book in Grid, List
// (LibraryList.tsx) or Cover flow (LibraryCoverFlow.tsx), under one toolbar
// (search, Search in, Sort, filters, count, Clear all, the Books / Series
// switch and the mode switch, one icon on the phone).
// On the phone the controls open in a sheet. "Select" starts bulk select
// (src/islands/Selection.tsx): a tap picks a book instead of opening it.
// The rules are in src/lib/library/browse.ts; this file only renders them.
import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { openOwnSpace } from '../lib/auth/server-client';
import { coverUrl, lookupEditions } from '../lib/catalog/client';
import { pageLanguage, t } from '../lib/i18n/i18n';
import { browse, clearAll, libraryBooks, liveQuery, searchIns, sorts, volumeLine, type Browsed, type LibraryBook, type LibraryQuery, type SearchIn, type SortBy } from '../lib/library/browse';
import type { FlowMove } from '../lib/library/flow';
import { letterGroups } from '../lib/library/letters';
import { savedLibraryState, type LibraryState } from '../lib/library/library-state';
import { groupings, modes, readGrouping, readMode, saveGrouping, saveMode, type Grouping, type Mode } from '../lib/library/mode';
import { bookHref, bookIsbns, workEdition } from '../lib/library/model';
import { seriesHref } from '../lib/library/series';
import { librarySeries, seriesCards, type LibrarySeries } from '../lib/library/series-mode';
import { Cover } from './Cover';
import { LibraryCoverFlow } from './LibraryCoverFlow';
import { useLibraryListing, type ListingSources } from './library-listing';
import { LetterIndex, LibraryList } from './LibraryList';
import { NotOwnedChip } from './NotOwnedChip';
import { liveSelection, SelectionBar, type PickedBook, type SelectionSources } from './Selection';

// Where the screen reads from: the reader's Library store and the Catalog.
export interface Sources extends ListingSources {
  selection?: SelectionSources;
}

const live: Sources = {
  open: async () => (await openOwnSpace())?.space,
  editions: lookupEditions,
  selection: liveSelection,
};

export default function LibraryIsland() {
  return <Library sources={live} />;
}

// The phone frame ends at 960 px (docs/design/ui-direction.md).
const desktop = '(min-width: 960px)';

// The Library state of this history entry (src/lib/library/library-state.ts),
// so the way back from a Book or a Series finds the Library as it was. Other
// keys of the entry stay.
const entry = (): Record<string, unknown> => (typeof history.state === 'object' && history.state !== null ? (history.state as Record<string, unknown>) : {});
const savedState = () => savedLibraryState(entry().library);
const remember = (part: Partial<LibraryState>) => history.replaceState({ ...entry(), library: { ...savedState(), ...part } }, '');
// Phone: the page scrolls. Desktop: the panel of AppShell does.
const panel = () => document.querySelector('[data-frame="panel"]');

export function Library({ sources }: { sources: Sources }) {
  // The Labels too: the Library shows and filters by them.
  const { read, message, editions, space, refresh } = useLibraryListing(sources, { labels: true });
  const [saved] = useState(savedState);
  const [asked, setQuery] = useState<LibraryQuery>(saved.query);
  // Where the reader moved the Cover flow to (src/lib/library/flow.ts).
  const [moved, setMoved] = useState<FlowMove | undefined>(saved.flow);
  const [grouping, setGrouping] = useState<Grouping>(readGrouping);
  const [mode, setMode] = useState<Mode>(readMode);
  const wide = useMedia(desktop);
  // Bulk select: on or off, and the Works picked, in the order of the taps.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => remember({ query: asked, flow: moved }), [asked, moved]);

  // The scroll is the island's to put back, once the books are drawn.
  // Kept as the page goes: at `pageswap` where there is one, since Chrome makes
  // the page shorter by `pagehide` during a page transition, which cuts the
  // scroll; at `pagehide` in a browser with no `pageswap`.
  useEffect(() => {
    history.scrollRestoration = 'manual';
    let kept = false;
    const keep = () => {
      if (kept) return;
      kept = true;
      remember({ scroll: { page: scrollY, panel: panel()?.scrollTop ?? 0 } });
    };
    // Back from the back/forward cache: the next departure keeps the scroll again.
    const shown = () => (kept = false);
    addEventListener('pageswap', keep);
    addEventListener('pagehide', keep);
    addEventListener('pageshow', shown);
    return () => {
      removeEventListener('pageswap', keep);
      removeEventListener('pagehide', keep);
      removeEventListener('pageshow', shown);
    };
  }, []);
  // Before the first paint with the books: the cover of a Book flying home
  // (src/lib/page-transition.ts) lands in its slot only if the slot is in sight.
  const scrolled = useRef(false);
  useLayoutEffect(() => {
    if (!read || scrolled.current) return;
    scrolled.current = true;
    scrollTo(0, saved.scroll.page);
    panel()?.scrollTo(0, saved.scroll.panel);
  }, [read, saved]);

  const books = useMemo(() => read && libraryBooks(read.library, editions, read.labels), [read, editions]);
  const series = useMemo(() => read && books && librarySeries(books, read.library, editions), [read, books, editions]);

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
        <a class="button button-main library-add" href="/check">
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
  const choose = (chosen: Mode) => {
    saveMode(chosen);
    setMode(chosen);
  };
  // Desktop: a switch with the three words. Phone: one icon (CORE-110).
  const modeSwitch =
    byBooks &&
    (wide ? (
      <Segmented name="library-mode" label={t('library.mode')} choices={modes} chosen={mode} text={(each) => t(`library.mode.${each}`)} onChange={choose} />
    ) : (
      <ModeMenu mode={mode} onChange={choose} />
    ));
  const change = (part: Partial<LibraryQuery>) => setQuery({ ...query, ...part });
  const clear = () => setQuery(clearAll(query));
  // Series mode counts its cards, out of the Series of the whole Library (CORE-116).
  const cards = grouping === 'series' && seriesCards(found.books, series, query.sort, pageLanguage());
  const shown = cards ? cards.length : found.books.length;
  // The count shows only while a search or a filter is on (CORE-110). Its live
  // region stays, empty and hidden, so a screen reader hears the first count.
  const count = (
    <p class={found.filtered ? 'library-count' : 'visually-hidden'} role="status">
      {found.filtered && (cards ? t('library.count-series', shown, new Set(series.values()).size, true) : t('library.count', shown, found.total, true))}
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
  const pick = (work: string) => setSelected(selected.includes(work) ? selected.filter((each) => each !== work) : [...selected, work]);
  const picked = selected.map((work): PickedBook => ({ work, isbn: bookIsbns(work, read.library)[0] ?? '', edition: workEdition(work, read.library, editions) }));
  const selectButton = !selecting && (
    <button class="button button-quiet" type="button" onClick={() => setSelecting(true)}>
      {t('select.start')}
    </button>
  );

  return (
    <div class="library">
      <div class="library-toolbar">
        {/* Cobalt blobs behind the top of the screen, never behind the books (ui-direction Q9). */}
        <div class="glow library-glow" aria-hidden="true">
          <span class="glow-blob glow-b1 library-b1" />
          <span class="glow-blob glow-b2 library-b2" />
          <span class="glow-blob glow-b3 library-b3" />
        </div>
        {!wide && groupingSwitch}
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
              {selectButton}
            </>
          ) : (
            <>
              <Sheet query={query} found={found} change={change} show={cards ? t('library.show-series', shown) : t('library.show', shown)} />
              {modeSwitch}
              {selectButton}
            </>
          )}
        </div>
        {wide ? (
          <Controls query={query} found={found} change={change} />
        ) : (
          <div class={found.filtered ? 'library-count-row' : 'visually-hidden'}>
            {count}
            {clearButton}
          </div>
        )}
        {listed && <LetterIndex index={listed.index} />}
      </div>

      {shown === 0 && !found.filtered ? (
        // Series mode with no book in a Series: nothing to clear.
        <p class="library-message">{t('library.no-series')}</p>
      ) : shown === 0 ? (
        <div class="library-no-match">
          <p>{t(cards ? 'library.no-series-match' : 'library.no-match')}</p>
          <button class="button" type="button" onClick={clear}>
            {t('library.clear-all')}
          </button>
        </div>
      ) : selecting ? (
        // Bulk select: the books the filter shows, in a grid whatever the mode, each a toggle.
        <ul class="library-grid">
          {found.books.map((book) => (
            <Book key={book.work} book={book} picked={selected.includes(book.work)} onPick={() => pick(book.work)} />
          ))}
        </ul>
      ) : cards ? (
        <ul class="library-grid">
          {cards.map((each) => (
            <SeriesCard key={`series ${each.cover.isbn}`} series={each} />
          ))}
        </ul>
      ) : listed ? (
        <LibraryList groups={listed.groups} />
      ) : mode === 'flow' ? (
        <LibraryCoverFlow books={found.books} moved={moved} onMove={setMoved} wide={wide} />
      ) : (
        <ul class="library-grid">
          {found.books.map((book) => (
            <Book key={book.work} book={book} />
          ))}
        </ul>
      )}
      {selecting && space && (
        <SelectionBar
          picked={picked}
          onAll={() => setSelected([...new Set([...selected, ...found.books.map(({ work }) => work)])])}
          onDone={() => {
            setSelecting(false);
            setSelected([]);
          }}
          space={space}
          library={read.library}
          // After Move to Series: the Catalog's new answers, so the books show their new Series.
          onSaved={refresh}
          sources={sources.selection ?? liveSelection}
        />
      )}
    </div>
  );
}

interface ControlsProps {
  query: LibraryQuery;
  found: Browsed;
  change: (part: Partial<LibraryQuery>) => void;
}

// Search in, Sort, the author and Series filters, and the chips: in the
// toolbar on desktop, in the sheet on the phone.
function Controls({ query, found, change }: ControlsProps) {
  // With no search or filter on, each count is the Library itself: none shows (CORE-110).
  const shown = (count: number) => (found.filtered ? count : undefined);
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
          <Chip key={status ?? 'all'} name={status ? t(`status.${status}`) : t('library.all-statuses')} count={shown(count)} pressed={query.status === status} onClick={() => change({ status })} />
        ))}
      </div>
      <div class="library-chips" role="group" aria-label={t('library.ownership')}>
        {found.owned.map(({ owned, count }) => (
          <Chip
            key={String(owned)}
            name={owned === null ? t('library.all-owned') : t(owned ? 'library.owned' : 'library.not-owned')}
            count={shown(count)}
            pressed={query.owned === owned}
            onClick={() => change({ owned })}
          />
        ))}
      </div>
      {/* Labels are made on the Book page (CORE-35); with none, no row. */}
      {found.labels.length > 1 && (
        <div class="library-chips" role="group" aria-label={t('library.label')}>
          {found.labels.map(({ label, name, count }) => (
            <Chip key={label ?? 'all'} name={label ? name : t('library.all-labels')} count={shown(count)} pressed={query.label === label} onClick={() => change({ label })} />
          ))}
        </div>
      )}
    </div>
  );
}

// The phone: one button opens the controls in a sheet; it shows how many are on.
// `show`: its button, which says how many books or Series show.
function Sheet({ query, found, change, show }: ControlsProps & { show: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const on = [query.searchIn !== 'all', query.author, query.series, query.status, query.label, query.owned !== null].filter(Boolean).length;
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
        <button class="button button-main library-show" type="button" onClick={() => dialog.current?.close()}>
          {show}
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

function Chip({ name, count, pressed, onClick }: { name: string; count: number | undefined; pressed: boolean; onClick: () => void }) {
  return (
    <button class="chip library-chip" type="button" aria-pressed={pressed} onClick={onClick}>
      <span class="library-chip-name">{name}</span>
      {count !== undefined && <span class="library-chip-count">{count}</span>}
    </button>
  );
}

// One choice among a few: the Books / Series switch and, on desktop, the Grid /
// List / Cover flow switch. Desktop: in the search row. Phone: Books / Series
// is a row of its own.
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

// The phone: Grid / List / Cover flow in the search row, as one icon, the
// mode's own. A tap opens the system menu of a native select, as the Reading
// Status chip does (CORE-105); a screen reader hears "View, Grid".
function ModeMenu({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  return (
    <span class="icon-button library-view">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        {modeIcons[mode]}
      </svg>
      <select
        aria-label={t('library.mode')}
        value={mode}
        onChange={(event) => {
          const chosen = modes.find((each) => each === event.currentTarget.value);
          if (chosen) onChange(chosen);
        }}
      >
        {modes.map((each) => (
          <option key={each} value={each}>
            {t(`library.mode.${each}`)}
          </option>
        ))}
      </select>
    </span>
  );
}

// Lucide's layout-grid, list and gallery-horizontal (https://lucide.dev, ISC),
// drawn here: an island cannot use the Astro icons of src/components/icons.ts.
const modeIcons: Record<Mode, ComponentChildren> = {
  grid: (
    <>
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="14" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
    </>
  ),
  list: <path d="M3 5h.01M3 12h.01M3 19h.01M8 5h13M8 12h13M8 19h13" />,
  flow: (
    <>
      <path d="M2 3v18M22 3v18" />
      <rect width="12" height="18" x="6" y="3" rx="2" />
    </>
  ),
};

// In bulk select (`onPick`), a toggle that picks the book instead of a link to it.
function Book({ book, picked, onPick }: { book: LibraryBook; picked?: boolean; onPick?: () => void }) {
  const volume = volumeLine(book);
  const line = [volume, book.authors.join(', ')].filter(Boolean).join(' · ');
  // Read with no Copy: a grey cover and the mark in the "not owned" colour (CORE-100, Q8).
  const name = book.owned ? 'library-book' : 'library-book library-not-owned';
  const content = (
    <>
      <Cover class="library-cover" src={book.cover} title={book.title} series={book.series} volumeTitle={book.volumeTitle} volume={volume} />
      <span class="library-book-title">{book.title}</span>
      {line && <span class="library-book-line">{line}</span>}
      {!book.owned && <NotOwnedChip class="library-book-mark" label={t('library.not-owned')} />}
    </>
  );
  return (
    <li>
      {onPick ? (
        <button class={`${name} library-pick`} type="button" aria-pressed={picked} onClick={onPick}>
          {content}
        </button>
      ) : (
        <a class={name} href={bookHref(book.work)}>
          {content}
        </a>
      )}
    </li>
  );
}

// Series mode: the Series in place of its books, as a card; it opens the Series page.
function SeriesCard({ series }: { series: LibrarySeries }) {
  const { cover } = series;
  return (
    <li>
      <a class="library-book library-series card" href={seriesHref(cover.isbn)}>
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
