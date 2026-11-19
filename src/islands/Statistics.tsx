// The Statistics screen, a Preact island (ADR 0019): the numbers of a period
// (a year, or All time) under a Label and "owned only", from the device copy
// of the Library and the Catalog facts of the device, so it opens offline.
// The period and the filters live in the URL (statistics-state.ts): each
// choice is a history entry, so Back and a reload keep them. Every number
// comes from src/lib/library/stats.ts; this file only renders them.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { openOwnSpace } from '../lib/auth/server-client';
import { lookupEditions } from '../lib/catalog/client';
import { monthNames, pageFormat, pageLanguage, t } from '../lib/i18n/i18n';
import { dayOf } from '../lib/library/day';
import { labelsAtoZ, type Label } from '../lib/library/label';
import type { Saved } from '../lib/library/records';
import { askedPeriod, readStatisticsQuery, statisticsSearch, type AskedStatistics } from '../lib/library/statistics-state';
import { dimensions, periodYear, statistics, type Dimension, type Period, type Statistics as Numbers, type StatsQuery } from '../lib/library/stats';
import { Columns } from './charts/Columns';
import { RankedBars } from './charts/RankedBars';
import { SharePicture } from './SharePicture';
import { Tile } from './charts/Tile';
import { useLibraryListing, type ListingSources } from './library-listing';

// Where the screen reads from: the reader's Library store and the Catalog.
export type Sources = ListingSources;

const live: Sources = {
  open: async () => (await openOwnSpace())?.space,
  editions: lookupEditions,
};

export default function StatisticsIsland() {
  return <Statistics sources={live} />;
}

export function Statistics({ sources }: { sources: Sources }) {
  const { read, message, editions } = useLibraryListing(sources, { labels: true });
  const [asked, setAsked] = useState<AskedStatistics>(() => readStatisticsQuery(location.search));
  const [dimension, setDimension] = useState<Dimension>('series');

  // Back and Forward: the URL of the entry says the choice.
  useEffect(() => {
    const restore = () => setAsked(readStatisticsQuery(location.search));
    addEventListener('popstate', restore);
    return () => removeEventListener('popstate', restore);
  }, []);

  const shown = useMemo(() => {
    if (!read) return undefined;
    const language = pageLanguage();
    const today = new Date();
    const count = (query: StatsQuery) => statistics({ library: read.library, editions, labels: read.labels, query, language, today });
    // A Label deleted since (on another device) is dropped.
    const label = read.labels.some(({ rkey }) => rkey === asked.label) ? asked.label : null;
    // All time first: it gives the years offered, the default period, and the reads with a day.
    const all = count({ period: 'all', label, ownedOnly: asked.ownedOnly });
    const query = { period: askedPeriod(asked.period, all.years, all.defaultPeriod), label, ownedOnly: asked.ownedOnly };
    return { query, all, numbers: query.period === 'all' ? all : count(query) };
  }, [read, editions, asked]);

  if (message) {
    return (
      <div class="stats">
        <p class="stats-message" role="status">
          {message}
        </p>
      </div>
    );
  }
  if (!read || !shown) return <StatisticsSkeleton />;

  const { query, all, numbers } = shown;
  const choose = (part: Partial<StatsQuery>) => {
    const next = { ...query, ...part };
    history.pushState(history.state, '', statisticsSearch(next));
    setAsked(next);
  };
  const format = pageFormat();
  const year = periodYear(query.period);
  // No read has a day: the empty state says how to add days.
  const noDatedRead = all.read === all.undated.reads;
  // The columns show what has a day in the period: a read, or a Copy.
  const columns = numbers.columns.groups.some((group) => group.read + group.added > 0);
  // "Most read" ranks the reads of the period (in All time, the undated ones too).
  const ranked = dimensions.some((each) => numbers.mostRead[each].rows.length > 0);
  const labels = labelsAtoZ(read.labels, pageLanguage());

  return (
    <div class="stats">
      <div class="stats-filters">
        <div class="stats-periods" role="group" aria-label={t('stats.period')}>
          {(['all', ...all.years] as Period[]).map((period) => (
            <button key={period} class="chip" type="button" aria-pressed={period === query.period} onClick={() => choose({ period })}>
              {periodYear(period) ?? t('stats.all-time')}
            </button>
          ))}
        </div>
        <FilterSheet query={query} labels={labels} choose={choose} />
        <div class="stats-filters-wide">
          <Filters query={query} labels={labels} choose={choose} />
        </div>
      </div>

      <section class="stats-lead" aria-label={t('stats.in-short')}>
        <p class="stats-hero">
          <span class="stats-hero-value">{format(numbers.read)}</span>{' '}
          <span class="stats-hero-label">{t('stats.read-in', numbers.read, year)}</span>
        </p>
        <div class="stats-tiles">
          <Tile label={t('stats.added')} value={numbers.added} format={format} />
          <Tile label={t('stats.reading')} value={numbers.reading} format={format} />
          <Tile label={t('stats.owned-unread')} value={numbers.ownedUnread} format={format} />
          {numbers.pagesRead && (
            <Tile label={t(numbers.pagesRead.atLeast ? 'stats.pages-read-at-least' : 'stats.pages-read')} value={numbers.pagesRead.pages} format={format} />
          )}
        </div>
      </section>

      {noDatedRead && <p class="card stats-empty">{t('stats.empty')}</p>}
      {columns && (
        <Columns
          // A new period starts on its own picked group.
          key={String(query.period)}
          title={t(numbers.columns.scale === 'month' ? 'stats.by-month' : 'stats.by-year')}
          scale={numbers.columns.scale}
          groups={numbers.columns.groups.map(({ at }) => groupNames(at))}
          series={[
            { label: t('stats.read'), values: numbers.columns.groups.map((group) => group.read) },
            { label: t('stats.added'), values: numbers.columns.groups.map((group) => group.added) },
          ]}
          picked={pickedGroup(numbers, query.period)}
          format={format}
        />
      )}

      <div class="stats-pair">
        {ranked && <MostRead numbers={numbers} dimension={dimension} onDimension={setDimension} />}
        <RankedBars
          title={t('stats.library-today')}
          nameHead={t('stats.status')}
          valueHead={t('stats.works')}
          rows={numbers.libraryToday.map(({ status, count }) => ({ name: t(`status.${status}`), value: count }))}
          note={t('stats.owned-line', numbers.owned.copies, numbers.owned.series, numbers.owned.readNotOwned)}
          format={format}
        />
      </div>

      <section class="stats-loans" aria-labelledby="stats-loans">
        <h2 class="small-heading" id="stats-loans">
          {t('stats.loans')}
        </h2>
        <dl class="card stats-numbers">
          <div>
            <dt>{t('stats.lent-now')}</dt>
            <dd>{format(numbers.loans.lentNow)}</dd>
          </div>
          <div>
            <dt>{year ? t('stats.loans-in', year) : t('stats.loans-all')}</dt>
            <dd>{format(numbers.loans.started)}</dd>
          </div>
          <div>
            <dt>{t('stats.average-days')}</dt>
            <dd>{numbers.loans.averageDays === null ? t('stats.no-average') : format(numbers.loans.averageDays)}</dd>
          </div>
        </dl>
      </section>

      {numbers.undated.reads + numbers.undated.copies > 0 && (
        <p class="stats-undated">
          <span>{t('stats.undated', numbers.undated.reads, numbers.undated.copies)}</span>
          <a href="/library">{t('stats.add-dates')}</a>
        </p>
      )}

      {/* Share, the main action of the page: the picture of these numbers (CORE-149). */}
      <SharePicture
        numbers={numbers}
        period={query.period}
        filters={{ label: read.labels.find(({ rkey }) => rkey === query.label)?.value.name ?? null, ownedOnly: query.ownedOnly }}
      />
    </div>
  );
}

// "2026-11": "N" under the column, "November 2026" in the readout and the
// table; "2026": the year. Month names come from the page language (Intl).
function groupNames(at: string): { label: string; name: string } {
  return at.length === 4 ? { label: at, name: at } : monthNames(at, pageLanguage());
}

// The month of today in the current year; else the last group.
function pickedGroup(numbers: Numbers, period: Period): number {
  // "2026-11": the month of the day on the device.
  const month = dayOf(new Date()).slice(0, 7);
  const at = period === Number(month.slice(0, 4)) ? numbers.columns.groups.findIndex((group) => group.at === month) : -1;
  return at >= 0 ? at : numbers.columns.groups.length - 1;
}

function MostRead({ numbers, dimension, onDimension }: { numbers: Numbers; dimension: Dimension; onDimension: (dimension: Dimension) => void }) {
  const { rows, outside } = numbers.mostRead[dimension];
  const note = outside > 0 ? t(`stats.outside.${dimension}`, outside) : rows.length === 0 ? t('stats.most-read-none') : undefined;
  return (
    <RankedBars title={t('stats.most-read')} nameHead={t(`stats.dimension.${dimension}`)} valueHead={t('stats.read')} rows={rows} note={note} format={pageFormat()}>
      <div class="segmented" role="radiogroup" aria-label={t('stats.most-read-by')}>
        {dimensions.map((each) => (
          <label key={each} class="segment">
            <input type="radio" name="stats-dimension" value={each} checked={each === dimension} onChange={() => onDimension(each)} />
            {t(`stats.dimension.${each}`)}
          </label>
        ))}
      </div>
    </RankedBars>
  );
}

interface FiltersProps {
  query: StatsQuery;
  labels: Saved<Label>[];
  choose: (part: Partial<StatsQuery>) => void;
}

// One Label at a time (a second tap turns it off), and "Owned only".
function Filters({ query, labels, choose }: FiltersProps) {
  return (
    <div class="stats-filter-chips">
      {labels.length > 0 && (
        <div class="stats-chip-row" role="group" aria-label={t('stats.label')}>
          <span class="stats-filter-name" aria-hidden="true">
            {t('stats.label')}
          </span>
          {labels.map(({ rkey, value }) => (
            <button key={rkey} class="chip" type="button" aria-pressed={query.label === rkey} onClick={() => choose({ label: query.label === rkey ? null : rkey })}>
              {value.name}
            </button>
          ))}
        </div>
      )}
      <button class="chip" type="button" aria-pressed={query.ownedOnly} onClick={() => choose({ ownedOnly: !query.ownedOnly })}>
        {t('stats.owned-only')}
      </button>
    </div>
  );
}

// The phone: the filters open in a sheet from a "Filter" button that shows
// how many are on. Desktop shows them in the row (CSS).
function FilterSheet(props: FiltersProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const on = [props.query.label, props.query.ownedOnly].filter(Boolean).length;
  return (
    <>
      <button class="button stats-filter-button" type="button" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
        <span>{t('stats.filter')}</span>
        {on > 0 && (
          <span class="stats-badge">
            <span aria-hidden="true">{on}</span>
            <span class="visually-hidden">{t('stats.filters-on', on)}</span>
          </span>
        )}
      </button>
      {/* A tap on the backdrop closes it, as Escape does. */}
      <dialog
        ref={dialog}
        class="stats-sheet"
        aria-label={t('stats.filter')}
        onClick={(event) => event.target === event.currentTarget && event.currentTarget.close()}
      >
        <Filters {...props} />
        <button class="button button-main" type="button" onClick={() => dialog.current?.close()}>
          {t('stats.done')}
        </button>
      </dialog>
    </>
  );
}

// While the Library loads; also the page's fallback before the island starts.
export function StatisticsSkeleton() {
  return (
    <div class="stats" aria-busy="true">
      <div class="skeleton stats-skeleton-hero" aria-hidden="true" />
      <div class="stats-tiles" aria-hidden="true">
        {[0, 1, 2].map((each) => (
          <div key={each} class="skeleton stats-skeleton-tile" />
        ))}
      </div>
      <div class="skeleton stats-skeleton-chart" aria-hidden="true" />
    </div>
  );
}
