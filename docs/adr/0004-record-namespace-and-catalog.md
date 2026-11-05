# Own namespace app.atomes, shared lexicons where they exist, catalog outside users' repos

Status: accepted

Record types the project defines live under `app.atomes.*`, from the domain atomes.app, which must never lapse because it is how other apps resolve these definitions. Where a community lexicon already covers a concept, we reuse it instead of defining our own. No community lexicon covers Reading Status yet, so it uses `app.atomes.readingStatus` (see the amendment below). Users' records reference Editions by ISBN and Series by catalog identifier. The catalog itself (Works, Editions, Series, release dates) is a separate service that is part of the open-source project, not data copied into every reader's repo.

## Considered Options

- Our own lexicon for everything: rejected, because it adds to an ecosystem that already fails to interoperate.
- Storing full book descriptions on each PDS (BookHive's approach): rejected, because catalog fixes would then have to be pushed into every reader's repo.

## Amendment 2026-11-05: Reading Status record type

This ADR first said Reading Status uses `community.lexicon.book.status`. That lexicon does not exist: the lexicon.community repository has no `book` lexicons and `_lexicon.book.lexicon.community` does not resolve (spike `docs/spikes/0002-catalog-sources-barcode-and-space-records.md`, section 4). Reading Status therefore uses our own `app.atomes.readingStatus`: the Edition's ISBN, the Work's Catalog identifier when known, the status (unread, reading, read, abandoned) and an optional finish date. The same record type is used in the Space (Private) and in the public repo (Shared). The reuse rule still holds: when a community book lexicon is published, Shared Reading Statuses also get a copy in that format.

- Using BookHive's `buzz.bookhive.book` instead: rejected, because it bundles status, review, rating and book description in one record (the approach rejected above) and requires BookHive's own `hiveId`.
