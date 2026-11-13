// The Shelf Check answer on Check a book (src/pages/check.astro), a Preact
// island (ADR 0014): owned, missing with the spine row, read, not in the
// Library, or unknown on this device. The rule is src/lib/library/shelf-check.ts;
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
}

export function ShelfCheckAnswer({ check, work, volumes }: AnswerProps) {
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
      {(check.kind === 'owned' || check.kind === 'read') && (
        <a class="answer-link" href={bookHref(work)}>
          {t('link.book-page')}
        </a>
      )}
    </>
  );
}
