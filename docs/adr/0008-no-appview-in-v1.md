# No AppView in v1: the app reads and writes the reader's PDS directly

Status: accepted

Version 1 has no AppView: it does not consume the firehose and does not index other readers' records. The app reads and writes the signed-in reader's PDS directly, including their Space for Private records (ADR 0003). The Catalog and the release watcher are not AppViews either, because they hold no reader records (ADR 0001, ADR 0005). We design records so that an indexer can be added later without migrating data.

## Consequences

- No features that span readers in v1: no feed, no "who else reads this", no search across public Libraries.
- Records must stay indexable as they are: stable `app.atomes.*` record types, references to Editions by ISBN and to Series by Catalog identifier (ADR 0004), and no field whose meaning depends on state held only by the app.

## Considered Options

- Build an AppView now: rejected, because it adds infrastructure and an index of readers' data, which conflicts with the server knowing only books (ADR 0001), for little value in v1.
