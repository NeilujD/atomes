// What the reader can share (glossary: Shared), and the record type of each
// category (ADR 0010). Copies, Loans and To Buy are never Shared, so no
// category names `app.atomes.copy`, `app.atomes.loan` or `app.atomes.toBuy`.
// Plain data: the server, the device and the OAuth scope read it.

export const categories = {
  readingStatuses: 'app.atomes.readingStatus',
  follows: 'app.atomes.follow',
  labels: 'app.atomes.label',
} as const;

export type Category = keyof typeof categories;

export const categoryNames = Object.keys(categories) as Category[];

export const sharedCollections: readonly string[] = Object.values(categories);

export const isCategory = (value: string): value is Category => Object.hasOwn(categories, value);

// What the reader shares, as the server answers it (GET /api/sharing).
export interface SharingState {
  shared: Record<Category, boolean>;
  // Works kept Private inside a Shared category: their Reading Status stays
  // off the PDS, and Labels are shared without them.
  privateWorks: string[];
  // Something has not reached the PDS yet (it could not be reached, or the
  // session lost its permission): the server tries again at the next change.
  pending: boolean;
  // The OAuth session may write Shared records. False: the reader signs in again first.
  canShare: boolean;
}
