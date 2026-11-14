# Readers correct the Catalog

Status: accepted (2026-11-14). Amends ADR 0010. Not built yet: milestone "M8b · Reader feedback".

The Catalog fills Edition Lines from BnF and the other sources (ADR 0010), and the sources are sometimes wrong or silent. In two weeks of real use the owner met: One Piece 13 and Naruto 20 missing from their lines (BnF has no record), Dragon Ball 41 in the wrong edition (amendment 2026-11-14), and books whose Series no source knows. Today a reader can only pick a Series for an ISBN that no source knows (amendment 2026-11-11). Decision: a signed-in reader can correct the Series and Volume of any Edition, and create a Series by hand. The fix is a **Series Correction**, stored in the Catalog, and it serves every reader of the instance.

## What a Series Correction is

- A Series Correction sets, for one Edition (ISBN): its Series, its Edition Line and its Volume number. It does not change the title, authors or cover.
- "New Series" makes a Series with a minted `atomes:` identifier (ADR 0010, "Identifiers"), from a title, a publisher, a language and a book size typed by the reader. Its first Edition Line follows.
- The Catalog stores each Series Correction with the source `reader`, the Account that made it and the date. The Account is never shown to other readers and never leaves the instance.
- A Catalog fill never overwrites a Series Correction. The Catalog applies Corrections after source data, on every read and after every fill.
- A later Series Correction of the same Edition replaces the earlier one. "Back to the sources" deletes it.
- The rules of ADR 0010 still decide the Work: a Correction moves an Edition, not a Work, and reader records are not rewritten.

## Where the reader makes one

- **Book page**: the line "Series: X · Change" opens a sheet: search an existing Series or "New Series", then pick the Edition Line, then the Volume number (filled in from the Catalog when known).
- **An unknown Volume tile** (Series page, Series Onboarding): scan or type the ISBN of that Volume, and it joins the Edition Line at that number. Series Onboarding keeps the reader's unsaved choices meanwhile.
- **Bulk select** in the Library or on a Series page: "Move to Series" moves every selected Edition. Known Volume numbers stay; the sheet asks only for the missing ones.

## Who may correct

- Only a signed-in reader, as for the pick of an unknown ISBN: a Correction writes data that every reader sees. Instances are invite-only (ADR 0016), so there is no moderation screen in this version.
- Rejected: a private override in each reader's Library. A fix that only one reader sees goes out of date when the Catalog fills the line again, and every other reader meets the same error.
- Rejected: send fixes back to BnF or Inventaire. Atomes cannot write to BnF; an Inventaire edit is a later idea, not a dependency.

## Consequences

- One Piece 13, Naruto 20 and Dragon Ball 41 can be fixed in a few taps by the first reader who meets them.
- A wrong Correction affects every reader of the instance until someone corrects it again. The Account and date on each Correction let the owner find and undo it with a script.
- When an open sign-up comes (CORE-86), Corrections will need limits and a moderation step.
