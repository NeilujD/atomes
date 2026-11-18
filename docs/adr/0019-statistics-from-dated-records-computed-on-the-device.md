# Statistics come from dated records, computed on the device

Status: accepted (2026-11-18). Amends ADR 0010. Built in milestone "M11 · Statistics". Research: spike 0004 (`docs/spikes/0004-reading-statistics-on-atproto.md`) and spike 0005 (`docs/spikes/0005-charts-and-share-pictures.md`).

A reader cannot see what they read and got over time. The Library answers "do I own it, did I read it" for one Work, not "how much did I read this year" or "do I buy more than I read". The records of today cannot answer: a Reading Status has an optional finish date that the reader types and that a change of status removes; its `updatedAt` is the time of the last tap, and Series Onboarding stamps it on Volumes read years before; no screen writes the date a Copy was got. Decision (grilling of 2026-11-18, Q1 to Q10 and R1 to R8): **a Statistics screen ("Statistiques") computes every number on the device from dated records, and the reader shares a picture that the device draws.**

## Decisions

**A Reading Status holds a start day and a finish day.** `app.atomes.readingStatus` gets an optional `startedAt` next to `finishedAt`. Both hold a calendar day, in the form the Book page writes today (`YYYY-MM-DDT00:00:00.000Z`). The app sets them when the reader changes the Reading Status of one Work (the Book page, the Volume sheet of the Series page, "Add and mark as read" in Shelf Check): *reading* sets the start day to today unless one exists; *read* sets the finish day to today and keeps the start day; *abandoned* keeps the start day and sets no finish day; *unread* removes both, and the toast offers Undo. The reader can correct both days on the Book page. A Work has one Reading Status (ADR 0010), so one read counts once, in the period of its finish day.

**A Copy holds the day the reader got it.** `app.atomes.copy.acquiredAt` exists in the lexicon, but no screen writes it. Quick Add of one Copy sets it to today, and the reader can correct it on the Book page. "Added" in Statistics counts Copies by this day.

**A Reading Status set by Bulk select or by Series Onboarding sets no date.** These say "read before", not "read today": 50 Volumes marked read in Series Onboarding must not show as 50 reads this month. A change that sets no date keeps a day that exists. Series Onboarding sets no `acquiredAt` on the Copies it adds either. A read or a Copy with no date counts in the "All time" totals, never in a chart by time, and the screen says how many there are, with a link to them in the Library.

**No backfill.** The records of today keep no date, and `updatedAt` and `createdAt` are the time of a tap, not of a read or a purchase. A script that copied them into `finishedAt` or `acquiredAt` would put years of reading into the month of the import. The reader adds the days that matter by hand, from the Book page.

**Every number is computed on the device.** A pure module (`src/lib/library/stats.ts`) makes every number of the screen from the device copy of the Library and the Catalog facts the device holds, as Owned-Unread and Missing Volumes are (ADR 0010, "Computed, never stored"). The server stores no total and still reads inside no record (ADR 0012). The screen opens offline, and the screen and the picture use one object, so they cannot disagree (spike 0004, pitfall 2).

**The share is a picture that the device draws.** The reader opens Share, sees the picture (Story 1080 × 1920 or Square 1080 × 1080), and sends it with the share sheet of the phone or downloads it. The device draws it on a canvas, with text and rectangles only: no cover, no title of a Work, and a switch hides the names of the Series. The preview is the consent, so Works kept Private inside a Shared category need no rule of their own. Nothing is published and nothing goes to the server, so a reader with no AT Protocol Account shares the same picture. A picture drawn on the server (spike 0005, section C) needed a font the server renderer could not load or a new package, and a route that reads the Library.

## Rejected

**A record per read-through.** It would give re-reads and every past read its own dates, as BookHive's `previousReads` does (spike 0004). But a Work has one Reading Status, keyed by its Work (ADR 0010), and the app, the Library, Shelf Check and Series counts read that one record. A second record type would need a merge on every screen and a new collection in the Library Space. Re-reads are out of scope.

**A total on the server.** A table of totals, or a record of totals on the PDS, would duplicate what the records already say and go wrong as soon as a record changes (ADR 0010, "Computed, never stored"). The server would also have to read inside Private records, which ADR 0012 refuses. Two apps that write one total record can overwrite each other (spike 0004, pitfall 10).

**A public statistics page.** BookHive and Papertrail share a link to a public page with an Open Graph picture (spike 0004, section C), but they compute from public records. Atomes keeps the Library Private by default, and Copies and Loans are never Shared. A public page would publish totals of Private data, and small counts can reveal the Works behind them (spike 0004, pitfall 11).

**A Bluesky post from the app.** A post with a picture needs two more OAuth scopes (`repo:app.bsky.feed.post`, `blob:image/*`), and every reader who wants it signs in again (spike 0005, section E). It serves only readers with an AT Protocol Account, and a compose link carries text only. The share sheet reaches Bluesky and every other network with no new scope.

## Consequences

- ADR 0010 gets an amendment for `startedAt` and the rules of `acquiredAt`. The owner publishes the changed lexicon (`scripts/publish-lexicons.ts`).
- A reader who shares Reading Statuses publishes `startedAt` with them, as `finishedAt` today. No new collection, no new OAuth scope, no new sign-in.
- The export and Delete my account cover the new fields with no change.
- A removed Copy leaves no trace, so "added" counts the Copies the reader still has. The end of a Copy (ADR 0010, amendment 2026-11-09, "later") would correct it.
- Charts are HTML and CSS with no chart library (spike 0005, section A); their colours are in `docs/design/ui-direction.md`.
- "Pages read" counts the pages of the dated reads of the period, from the Catalog page count. An omnibus Copy's pages are split equally between its Works (`stats.ts`): reading every Volume of an omnibus counts the book once, and one Volume read counts its share.
- The share picture holds its colours as hex (`src/lib/library/picture-colours.ts`), the dark values of `theme.css`, on purpose: a canvas reads no CSS variable. `picture-colours.test.ts` fails when one differs from `theme.css`. This is the same exception as the Sign-in Code email (ADR 0018).
