// The Shelf Check answer for a book the Catalog does not know, above the form
// where the reader types it (src/pages/check.astro), a Preact island (ADR
// 0014): owned, read, or not in the Library. A book the Catalog knows gets the
// result screen instead (ShelfCheckResult.tsx). The rule is
// src/lib/library/shelf-check.ts.
import { t } from '../lib/i18n/i18n';
import { bookHref } from '../lib/library/model';
import type { ShelfCheck } from '../lib/library/shelf-check';

export interface AnswerProps {
  check: ShelfCheck;
  // The Work of the book, for its Book page.
  work: string;
}

export function ShelfCheckAnswer({ check, work }: AnswerProps) {
  const status = t(`status.${check.status}`);
  const [title, text] = {
    owned: [t('check.owned'), t('check.status', status)],
    // A book with no Catalog data is in no Series: never missing.
    missing: [t('check.missing', check.followed?.title ?? ''), ''],
    read: [t('check.read', status), ''],
    new: [t('check.new'), ''],
    unknown: [t('check.unknown'), t('check.unknown-text')],
  }[check.kind];
  return (
    <>
      <p class="answer-title">{title}</p>
      {text && <p class="answer-text">{text}</p>}
      {(check.kind === 'owned' || check.kind === 'read') && (
        <a class="answer-link" href={bookHref(work)}>
          {t('link.book-page')}
        </a>
      )}
    </>
  );
}
