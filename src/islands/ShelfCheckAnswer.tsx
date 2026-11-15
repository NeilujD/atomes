// The Shelf Check answer on Check a book (src/pages/check.astro), a Preact
// island (ADR 0014): owned, missing with the spine row, read, not in the
// Library, or unknown on this device; for a Volume of a Series, the Series
// line and Follow. The rule is src/lib/library/shelf-check.ts;
// online and offline answers render here the same way.
import { t } from '../lib/i18n/i18n';
import { bookHref } from '../lib/library/model';
import type { ShelfCheck } from '../lib/library/shelf-check';

export interface AnswerProps {
  check: ShelfCheck;
  // The Work of the book, for its Book page.
  work: string;
  // The Volumes of the book, marked on the spine row.
  volumes: number[];
  // Follows the Series in the Edition Line of this book (Series line, followable).
  onFollow?: () => void;
  // While the follow saves: a second tap cannot save twice.
  following?: boolean;
  // The Series line is coming (its Edition Line loads): keep its place.
  seriesLoading?: boolean;
}

export function ShelfCheckAnswer({ check, work, volumes, onFollow, following = false, seriesLoading = false }: AnswerProps) {
  const status = t(`status.${check.status}`);
  const series = check.followed?.title ?? '';
  const [title, text] = {
    owned: [t('check.owned'), t('check.status', status)],
    missing: [t('check.missing', series), [t('check.missing-text'), check.status === 'unread' ? '' : t('check.status', status)].filter(Boolean).join(' ')],
    read: [t('check.read', status), ''],
    new: [t('check.new'), check.followed ? t('check.followed', series) : ''],
    unknown: [t('check.new'), t('check.unknown-text')],
  }[check.kind];
  return (
    <>
      <p class="answer-title">{title}</p>
      {text && <p class="answer-text">{text}</p>}
      {check.spines && (
        <ol class="answer-spines" aria-label={t('check.spines', series)}>
          {check.spines.map(({ volume, state }) => (
            <li key={volume} class="answer-spine" data-state={state} aria-current={volumes.includes(volume) ? 'true' : undefined}>
              <span class="answer-spine-bar" aria-hidden="true" />
              <span aria-hidden="true">{volume}</span>
              <span class="visually-hidden">{t('series.spine', volume, state)}</span>
            </li>
          ))}
        </ol>
      )}
      {check.series && (
        <div class="answer-series">
          <p class="answer-text">{t('check.series-line', check.series.owned, check.series.total, check.series.missing)}</p>
          {check.series.followable && onFollow && (
            <button class="button answer-follow" type="button" disabled={following} aria-busy={following || undefined} onClick={onFollow}>
              {t('series.follow')}
            </button>
          )}
        </div>
      )}
      {!check.series && seriesLoading && <div class="skeleton answer-series-skeleton" aria-hidden="true" />}
      {(check.kind === 'owned' || check.kind === 'read') && (
        <a class="answer-link" href={bookHref(work)}>
          {t('link.book-page')}
        </a>
      )}
    </>
  );
}
