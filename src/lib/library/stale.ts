// What the reader is told when a change made on this device was refused
// because another device changed the record first (ADR 0012): the other
// change is kept, and the toast names the book.
import type { Lookup } from '../catalog/catalog';
import { t } from '../i18n/i18n';
import type { Space, StaleWrite } from '../space/space';
import { copyCollection } from './copy';
import { loanCollection } from './loan';

interface Named {
  isbn?: unknown;
  anchorIsbn?: unknown;
  copy?: unknown;
  name?: unknown;
  details?: { title?: unknown };
}

const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : undefined);

export async function staleNotice(
  { collection, rkey, value }: StaleWrite,
  { space, lookup }: { space: Space; lookup: (isbn: string) => Promise<Lookup> },
): Promise<string> {
  const record = (value ?? {}) as Named;
  // A Label names itself; a Loan names the book of its Copy.
  const name = text(record.details?.title) ?? text(record.name);
  if (name) return t('saved.stale', name);
  let isbn = text(record.isbn) ?? text(record.anchorIsbn);
  if (!isbn && collection === loanCollection) {
    const copy = (await space.list(copyCollection).catch(() => undefined))?.records.find((each) => each.rkey === record.copy);
    isbn = text((copy?.value as Named | undefined)?.isbn);
  }
  if (!isbn) return t('saved.stale', rkey);
  const answer = await lookup(isbn).catch((): Lookup => ({ unavailable: true }));
  return t('saved.stale', 'found' in answer ? answer.found.title : `ISBN ${isbn}`);
}
