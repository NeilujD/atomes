// `app.atomes.copy`: a physical book the reader owns (ADR 0010). Never Shared.
import { t } from '../i18n/i18n';
import { newRecordKey, type Space, type WriteState } from '../space/queued-store';
import { dayOf } from './day';
import { isIsbn13, isWorkId } from './ids';
import { listRecords, putRecord } from './records';

export const copyCollection = 'app.atomes.copy';

// Typed by the reader when the Catalog does not know the ISBN.
export interface BookDetails {
  title: string;
  authors?: string[];
  series?: string;
  volume?: string;
}

export interface Copy {
  isbn: string;
  // Works this Copy contains; several for an omnibus.
  works: string[];
  acquiredAt?: string;
  details?: BookDetails;
  createdAt: string;
}

// The Quick Add form fields, as typed. Authors are one field, split at commas.
export type TypedFields = Record<'title' | 'authors' | 'series' | 'volume', string>;

// What the reader typed for a book the Catalog does not know, or what to fix.
// The form's maxlength keeps each field inside the lexicon; the author list
// is one field, so its count and each name are checked here.
export function typedDetails(fields: TypedFields): { details: BookDetails } | { problem: string } {
  const title = fields.title.trim();
  if (!title) return { problem: t('details.no-title') };
  const authors = fields.authors
    .split(',')
    .map((author) => author.trim())
    .filter(Boolean);
  if (authors.length > 20) return { problem: t('details.too-many-authors') };
  if (authors.some((author) => graphemes(author) > 64)) return { problem: t('details.author-too-long') };
  const details: BookDetails = { title };
  if (authors.length > 0) details.authors = authors;
  const series = fields.series.trim();
  if (series) details.series = series;
  const volume = fields.volume.trim();
  if (volume) details.volume = volume;
  return { details };
}

function graphemes(text: string): number {
  return [...new Intl.Segmenter().segment(text)].length;
}

// The Copy Quick Add makes ("Add another Copy" too): got today (ADR 0019).
// Series Onboarding makes its Copies with no day: they were got before.
export function quickAddCopy(book: { isbn: string; work: string; details?: BookDetails }, now: Date): Copy {
  const { isbn, work, details } = book;
  return { isbn, works: [work], ...(details && { details }), acquiredAt: dayOf(now), createdAt: now.toISOString() };
}

// The Copy with the day the reader typed on the Book page (`YYYY-MM-DD`), or
// with no day when they emptied the field.
export function gotOn(copy: Copy, day: string): Copy {
  const changed: Copy = { ...copy, acquiredAt: `${day}T00:00:00.000Z` };
  if (!day) delete changed.acquiredAt;
  return changed;
}

// A new Copy gets a new key; pass the key of an existing Copy to change it.
export async function saveCopy(space: Space, copy: Copy, rkey = newRecordKey()): Promise<{ rkey: string; state: WriteState }> {
  if (!isIsbn13(copy.isbn)) throw new Error(`Not an ISBN-13: ${copy.isbn}`);
  const badWork = copy.works.find((work) => !isWorkId(work));
  if (badWork !== undefined) throw new Error(`Not a Work identifier: ${badWork}`);
  const state = await putRecord(space, copyCollection, rkey, copy);
  return { rkey, state };
}

export function deleteCopy(space: Space, rkey: string): Promise<WriteState> {
  return space.delete(copyCollection, rkey);
}

export function listCopies(space: Space) {
  return listRecords<Copy>(space, copyCollection);
}
