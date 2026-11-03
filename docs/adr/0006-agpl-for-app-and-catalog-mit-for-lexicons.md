# The app and the Catalog are AGPL-3.0; lexicons are MIT

Status: accepted

All code in this repository (the app, the Catalog and the release watcher) is licensed under AGPL-3.0, so anyone who runs a modified copy as a public service must publish their changes, and hosted forks stay open. The lexicon definitions (the `app.atomes.*` record types) are licensed under MIT, so any app, open or closed, can adopt them without licence concerns. Interoperability is the reason the reader's data lives on their own PDS (ADR 0001) and the reason we reuse shared lexicons (ADR 0004); a copyleft licence on the record types would work against it.

## Consequences

- The root `LICENSE` file holds the AGPL-3.0 text and covers everything except the lexicons.
- When a lexicon folder is added, it gets its own MIT `LICENSE` file. Until then, this ADR and the README are the record of the MIT grant.

## Considered Options

- MIT or Apache-2.0 for everything: rejected, because a hosted fork could close the code.
- GPL-3.0 for the app: rejected, because it has no network clause, so a hosted fork would not have to share its changes.
- CC0 for the lexicons: also acceptable; MIT chosen because it is more familiar to developers and keeps attribution.
