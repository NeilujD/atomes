# Atomes

A personal library tracker for one reader: what they own, what they have read, and which series have new volumes they don't have yet.

## Library

**Library**:
Everything the reader owns or has read, across all their devices.
_Avoid_: Collection, catalogue, bookshelf

**Work**:
A story or text, independent of how it was published (e.g. "Dune", "One Piece volume 12").
_Avoid_: Book, title

**Edition**:
A specific publication of a Work, usually identified by an ISBN (publisher, language, format).
_Avoid_: Version, release, book

**Copy**:
A physical item the reader owns, which is an instance of an Edition. One Copy can contain several Works (an omnibus covering Volumes 1–3).
_Avoid_: Book, item, possession

**Lent To**:
A note on a Copy saying who currently has it.
_Avoid_: Loan, borrowed by

**Catalog**:
The shared reference of Works, Editions, Series and their release dates that readers' Libraries point to. It belongs to no single reader.
_Avoid_: Database, book index

## Reading

**Reading Status**:
Where the reader stands with a Work: *unread*, *reading*, *read* or *abandoned*. It belongs to the Work, not to a Copy, and it can exist without any Copy (borrowed, library, ebook).
_Avoid_: Progress, state

**Label**:
A word the reader attaches to Works to group and filter them by theme or category (e.g. Sci-fi, Manga, To re-read). Labels are personal and Private by default; the Catalog may suggest some from a Work's subjects.
_Avoid_: Tag, genre, category, shelf

**Owned-Unread**:
A Work the reader has at least one Copy of and whose Reading Status is *unread*.
_Avoid_: Backlog, to-read pile, TBR

## Series

**Series**:
An ordered set of Works published as numbered or sequential Volumes (manga, comics, novel sagas).
_Avoid_: Saga, collection, franchise

**Volume**:
A Work's position within a Series.
_Avoid_: Tome, issue, book

**Edition Line**:
A Series as published by one publisher, in one language and format (e.g. One Piece, Glénat, French, standard). The reader collects a Series in one Edition Line at a time and may switch from a given Volume onward.
_Avoid_: Collection, imprint, version

**Followed Series**:
A Series, in a given Edition Line, that the app watches for New Volumes. A Series becomes followed automatically when the reader marks one of its Volumes read.
_Avoid_: Subscription, watchlist

**Dropped Series**:
A Series the reader has deliberately stopped following. It is separate from abandoning a Volume: abandoning one suggests dropping the Series but doesn't do it.
_Avoid_: Unfollowed, cancelled, abandoned series

**New Volume**:
A Volume of a Followed Series that is now in shops in the reader's Edition Line and that they don't own yet.
_Avoid_: Release, update, new tome

**Upcoming Volume**:
A Volume of a Followed Series that has been announced with a date in the reader's Edition Line but isn't in shops yet.
_Avoid_: Pre-order, announcement

**Release Report**:
A reader's statement that a Volume is out, or is announced for a date, in a given Edition Line. It adds that information to the Catalog for everyone.
_Avoid_: Submission, tip, announcement

**Missing Volume**:
A Volume of a Followed Series, earlier than the latest one the reader owns, that they don't own.
_Avoid_: Gap, hole

## Buying

**To Buy**:
The reader's list of Editions they intend to acquire. Missing Volumes and New Volumes of Followed Series appear on it automatically, and any Edition can be added by hand.
_Avoid_: Wishlist, shopping list, want-to-read

## Visibility

**Private**:
Visible only to the reader. Every part of the Library is Private unless the reader shares it.
_Avoid_: Hidden, secret

**Shared**:
Deliberately made visible to anyone. The reader shares by category (for example Reading Statuses) and can keep individual Works Private inside a Shared category. Copies, To Buy and Lent To are never Shared.
_Avoid_: Public, published

## Capture

**Quick Add**:
Adding a Copy to the Library right after acquiring it, mainly by scanning the ISBN barcode, with cover recognition as a fallback.
_Avoid_: Import, scan-in

**Shelf Check**:
Pointing the phone at a book (usually in a shop) to learn whether the reader already owns it, has read it, or is missing it from a Series. It must work offline.
_Avoid_: Lookup, search, in-store mode

**Series Onboarding**:
The moment a Series first enters the Library, when the app asks which of its Volumes the reader already owns.
_Avoid_: Series import, bulk add
