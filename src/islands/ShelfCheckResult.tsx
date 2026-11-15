// The Shelf Check result screen (CORE-120), a Preact island (ADR 0014) in the
// `<dialog data-result>` of Check a book (src/pages/check.astro), which also
// holds its styles. Green when the reader does not own the book, orange when
// they do, neutral when this device cannot tell. The rule is
// src/lib/library/shelf-check.ts; online and offline answers render here the
// same way. Book data comes from outside sources: Preact renders it as text.
import type { Edition } from '../lib/catalog/catalog';
import { pageLanguage, t } from '../lib/i18n/i18n';
import { bookHref, languageName } from '../lib/library/model';
import { seriesBar, type SeriesLine, type ShelfCheck, type ShelfCheckKind } from '../lib/library/shelf-check';
import { Cover } from './Cover';

export type ResultTone = 'go' | 'owned' | 'unknown';

// Orange: the reader owns it. Neutral: this device cannot tell. Green: any other answer.
export function resultTone(kind: ShelfCheckKind): ResultTone {
  if (kind === 'owned') return 'owned';
  return kind === 'unknown' ? 'unknown' : 'go';
}

export interface ResultBook {
  isbn: string;
  work: string;
  // Undefined offline when this device has no Catalog data for the ISBN: the answer only.
  edition?: Edition;
  // The title to show with no Edition (typed on a Copy, else the ISBN).
  title: string;
}

export interface ResultProps {
  book: ResultBook;
  check: ShelfCheck;
  // The cover image, none offline when this device has not kept it.
  cover: string | null;
  // When the first Copy was added (owned).
  addedAt?: string;
  // The Series card is coming (its Edition Line loads): keep its place.
  seriesLoading?: boolean;
  // While the follow saves: a second tap cannot save twice.
  following?: boolean;
  // While a Copy saves: which button shows it.
  saving?: 'add' | 'read';
  // The browser can open a camera.
  canScan: boolean;
  onClose: () => void;
  onScan: () => void;
  // Saves a Copy; `read`: with the Reading Status read.
  onAdd: (read: boolean) => void;
  onFollow?: () => void;
}

export function ShelfCheckResult(props: ResultProps) {
  const { book, check, cover, addedAt, seriesLoading = false, saving, canScan, onClose, onScan } = props;
  const { edition } = book;
  const status = t(`status.${check.status}`);
  const pill = {
    owned: t('check.owned'),
    missing: t('check.missing', check.followed?.title ?? ''),
    read: t('check.read', status),
    new: t('check.new'),
    unknown: t('check.unknown'),
  }[check.kind];
  const volumes = edition?.volumes ?? [];
  const volume = volumes.length > 0 ? t('book.volumes', volumes) : '';
  const title = edition?.series && volume ? `${edition.series.title}, ${volume}` : (edition?.title ?? book.title);
  const subline = edition ? [edition.authors.join(', '), edition.publisher].filter(Boolean).join(' · ') : '';
  const chips = [edition && languageName(edition), edition?.format, t('book.isbn', book.isbn)].filter((chip): chip is string => Boolean(chip));
  const linked = check.kind === 'owned' || check.kind === 'read';
  const added = check.kind === 'owned' && addedAt ? t('check.added-on', new Intl.DateTimeFormat(pageLanguage(), { dateStyle: 'long' }).format(new Date(addedAt))) : '';

  return (
    <div class="result-screen" data-tone={resultTone(check.kind)}>
      <div class="result-glow" aria-hidden="true">
        <span class="result-blob result-b1" />
        <span class="result-blob result-b2" />
        <span class="result-blob result-b3" />
        <span class="result-fade" />
      </div>
      <div class="result-scroll">
        <div class="result-header">
          <button class="result-round" type="button" aria-label={t('common.close')} disabled={saving !== undefined} onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <span class="result-heading">{t('check.result')}</span>
          {canScan ? (
            <button class="result-round" type="button" aria-label={t('add.scan')} disabled={saving !== undefined} onClick={onScan}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16" />
              </svg>
            </button>
          ) : (
            <span class="result-round-space" />
          )}
        </div>

        <div class="result-top">
          <div class="result-stage">
            <span class="result-ring result-r1" aria-hidden="true" />
            <span class="result-ring result-r2" aria-hidden="true" />
            <span class="result-ring result-r3" aria-hidden="true" />
            <span class="result-halo" aria-hidden="true" />
            <Cover
              class="result-cover"
              src={cover}
              title={edition?.title ?? book.title}
              series={edition?.series?.title ?? null}
              volumeTitle={edition?.volumeTitle ?? null}
              volume={volume}
            />
          </div>
          {/* Focused when the screen opens, not tabbable: screen readers say the answer first. */}
          <p class="result-pill" tabindex={-1} data-result-answer>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              {check.kind === 'owned' ? (
                <>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7.5v5.5M12 16.5h.01" />
                </>
              ) : check.kind === 'unknown' ? (
                <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" />
              ) : (
                <path d="M20 6L9 17l-5-5" />
              )}
            </svg>
            <span>{pill}</span>
          </p>
        </div>

        <div class="result-text">
          <h2 class="result-title">{linked ? <a href={bookHref(book.work)}>{title}</a> : title}</h2>
          {subline && <p class="result-subline">{subline}</p>}
          {check.kind === 'unknown' && !edition && <p class="result-quiet">{t('check.unknown-text')}</p>}
        </div>

        {check.series ? (
          <SeriesCard series={check.series} volumes={volumes} following={props.following ?? false} onFollow={props.onFollow} />
        ) : (
          seriesLoading && <div class="result-card result-card-skeleton" aria-hidden="true" />
        )}
        {added && <p class="result-quiet result-added">{added}</p>}

        <ul class="result-chips">
          {chips.map((chip) => (
            <li key={chip} class="result-chip">
              {chip}
            </li>
          ))}
          {/* One quiet mention (CORE-111): a Copy is never Shared, nothing to change. */}
          <li class="result-chip">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect width="18" height="11" x="3" y="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            {t('add.private')}
          </li>
        </ul>

        <Actions {...props} />
      </div>
    </div>
  );
}

// Not owned: Add to Library, and Add and mark as read. Owned: Scan another
// book, and Add another Copy. No Catalog data offline: nothing to add.
function Actions({ book, check, saving, canScan, onScan, onAdd }: ResultProps) {
  const busy = (which: 'add' | 'read') => ({ disabled: saving !== undefined, 'aria-busy': saving === which || undefined });
  const scan = canScan && (
    <button class="result-action result-primary" type="button" disabled={saving !== undefined} onClick={onScan}>
      {t('check.scan-another')}
    </button>
  );
  if (!book.edition) return scan ? <div class="result-actions">{scan}</div> : null;
  if (check.kind === 'owned') {
    return (
      <div class="result-actions">
        {scan}
        <button class={`result-action ${scan ? 'result-secondary' : 'result-primary'}`} type="button" {...busy('add')} onClick={() => onAdd(false)}>
          {t('book.add-copy')}
        </button>
      </div>
    );
  }
  return (
    <div class="result-actions">
      <button class="result-action result-primary" type="button" {...busy('add')} onClick={() => onAdd(false)}>
        {t('add.submit')}
      </button>
      {check.status !== 'read' && (
        <button class="result-action result-secondary" type="button" {...busy('read')} onClick={() => onAdd(true)}>
          {t('check.add-read')}
        </button>
      )}
    </div>
  );
}

// "Your Series": the counts, the Edition Line drawn (seriesBar), the Series
// line, and Follow for a Series neither followed nor dropped.
function SeriesCard({ series, volumes, following, onFollow }: { series: SeriesLine; volumes: number[]; following: boolean; onFollow?: () => void }) {
  const bar = seriesBar(series, volumes);
  return (
    <section class="result-card" aria-label={t('check.your-series')}>
      <div class="result-card-head">
        <span class="result-card-title">{t('check.your-series')}</span>
        <span class="result-quiet">{t('check.series-counts', series.owned, series.read)}</span>
      </div>
      {'segments' in bar ? (
        <div class="result-segments" aria-hidden="true">
          {bar.segments.map((state, at) => (
            <span key={at} class="result-segment" data-state={state} />
          ))}
        </div>
      ) : (
        <div class="result-bar" aria-hidden="true">
          <span class="result-bar-fill" style={{ width: `${bar.ownedShare * 100}%` }} />
          {bar.at !== undefined && <span class="result-bar-mark" style={{ left: `${bar.at * 100}%` }} />}
        </div>
      )}
      <div class="result-card-foot">
        <p class="result-quiet">{t('check.series-line', series.owned, series.total, series.missing)}</p>
        {series.followable && onFollow && (
          <button class="result-follow" type="button" disabled={following} aria-busy={following || undefined} onClick={onFollow}>
            {t('series.follow')}
          </button>
        )}
      </div>
    </section>
  );
}
