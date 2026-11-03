# Own namespace app.atomes, shared lexicons where they exist, catalog outside users' repos

Status: accepted

Record types the project defines live under `app.atomes.*`, from the domain atomes.app, which must never lapse because it is how other apps resolve these definitions. Where a community lexicon already covers a concept, we reuse it instead of defining our own: Reading Status uses `community.lexicon.book.status`, so other atproto book apps can understand it. Users' records reference Editions by ISBN and Series by catalog identifier. The catalog itself (Works, Editions, Series, release dates) is a separate service that is part of the open-source project, not data copied into every reader's repo.

## Considered Options

- Our own lexicon for everything: rejected, because it adds to an ecosystem that already fails to interoperate.
- Storing full book descriptions on each PDS (BookHive's approach): rejected, because catalog fixes would then have to be pushed into every reader's repo.
