# Library records: five record types, Catalog identifiers and record keys

Status: accepted

The Library is stored as five record types, published as lexicons in `lexicons/app/atomes/` and listed in the Library Space (`app.atomes.library`). They follow ADR 0004 (own namespace, Editions by ISBN, Series by Catalog identifier) and ADR 0008 (an indexer can read them later without migration): records hold only ISBNs, Catalog identifiers and what the reader said, never data copied from the Catalog and never anything the app can compute.

| Record type | One record per | Record key | Holds |
|---|---|---|---|
| `app.atomes.copy` | Copy (two Copies of one Edition are two records) | TID | Edition ISBN, the Works it contains, Lent To (replaced by `app.atomes.loan`, see the 2026-11-09 amendment), acquired date, book details typed by the reader when the Catalog does not know the ISBN |
| `app.atomes.readingStatus` | Work | Work identifier | Work, ISBN of the Edition read, status (unread, reading, read, abandoned), optional finish date |
| `app.atomes.follow` | Series | Series identifier | Series, anchor ISBN, optional `fromVolume`, status (following, dropped) |
| `app.atomes.toBuy` | Edition added by hand | ISBN-13 | ISBN |
| `app.atomes.label` | Label | TID | Name, the Works that carry it |
| `app.atomes.loan` | Loan (added by the 2026-11-09 amendment) | TID | Copy record key, borrower, lent date, return date once back |

Each record type also has a `createdAt` or `updatedAt` datetime.

## Identifiers

- **Edition**: the ISBN-13, 13 digits, no hyphens, valid check digit, prefix 978 or 979 but not 9790 (sheet music).
- **Series and Work**: a Catalog identifier `<scheme>:<value>`, chosen by the Catalog in this order (spike 0002, section 2):
  - `wd:Q…`: Wikidata.
  - `inv:<32 hex>`: Inventaire entity not yet in Wikidata.
  - `ol:OL…`: Open Library.
  - `atomes:<host>:<ULID>`: minted by a Catalog instance when no source knows the entity. The host keeps it unique across instances.
- **Work, when no Catalog identifies it**: `isbn:<isbn13>`, the one Work of that Edition. The Catalog learns the real Work later and links it.
- **An identifier never changes once a record uses it.** Each Catalog keeps `same_as` links (for example `atomes:catalog.example:01J…` = `wd:Q123`) and resolves both. It never rewrites reader records. A Catalog that cannot resolve an `atomes:` identifier (its host is gone) shows the Series from the reader's own records until a `same_as` link exists.
- **Edition Line is not stored.** A follow holds an anchor ISBN, an Edition in the Edition Line the reader collects. Every Catalog derives the Edition Line from it (Series, publisher, language and book size; see the amendments below). Inside a Catalog the Edition Line key is internal and may change when the Catalog fixes its data.

Every identifier above is also a valid atproto record key, so it is the key itself where the table says so.

## Record keys enforce "one per"

A Reading Status is keyed by its Work identifier, so a Work has exactly one: saving again replaces it, and no merge is needed when two devices write. No record means unread. A follow is keyed by its Series identifier, so switching Edition Line or dropping the Series changes the same record. A To Buy item is keyed by its ISBN, so an Edition is on the list once. Copies and Labels use TIDs: a reader can own two Copies of one Edition, and a renamed Label keeps its key.

## Computed, never stored

Owned-Unread, Missing Volumes, New and Upcoming Volumes, the automatic part of To Buy and Series counts (owned, read, missing, next) are computed on the device from these records and Catalog data. Storing them would duplicate state that goes wrong as soon as the Catalog or a record changes.

## Validation

The PDS stores Space records without validating them against our lexicons (spike 0002, section 4). Each record type therefore has one module in `src/lib/library/` that checks every record against its lexicon with `@atproto/lexicon`, and checks identifiers, before it writes. When it lists records, it skips those that do not match the lexicon (another app, an older shape).

`status` fields use `knownValues`, not `enum`, so that a value can be added later without making old records or old clients invalid. The app writes only the values listed here. A client that reads an unknown value treats it like a missing record.

## Changing a lexicon

Lexicons are published by the owner (`scripts/publish-lexicons.ts`), so changes must stay backward compatible: add optional fields only, never remove or rename a field, never make an optional field required. Adding a collection to the Library Space widens access at the next token refresh, without a new consent screen (spike 0002, section 6): treat it as a deliberate decision.

## Considered Options

- Store the Edition Line in the follow record: rejected. No source identifies Edition Lines; the grouping is ours and will be fixed over time, which must not need a change in readers' repos (ADR 0004).
- Store the Reading Status on the Copy: rejected. It belongs to the Work and can exist without a Copy (glossary: Reading Status).
- One record per Work for Labels (a Work's Label list): rejected. Renaming or deleting a Label would rewrite every Work that carries it.
- Store Missing Volumes on To Buy: rejected, see "Computed, never stored".
- TID keys for Reading Status, with a lookup by Work: rejected. Two devices could each create one and the app would need to merge them.

## Amendment 2026-11-05: Edition Line without format

This ADR first said the Edition Line is derived from publisher, language and format. Catalog v0 (CORE-27) derives it from **Series, publisher and language** only. The sources give no format: BnF and SUDOC give the book size in cm (UNIMARC 215 `$d`), and it changes inside one Edition Line (One Piece, Glénat: Volume 56 is "18 x 12 cm", Volume 112 is "19 cm"). With the size in the key, one Edition Line split in two.

- Consequence: two Edition Lines of one Series with the same publisher and language (for example a standard and a deluxe edition) are grouped as one until the Catalog can tell them apart. The reader's records do not change when that is fixed, because the Edition Line key is internal (see Identifiers).
- Follow-up: tell such Edition Lines apart from their own Series record when they have one (BnF 461 `$0`) or from title words ("Perfect Edition", "Deluxe"), once recorded answers for such a Series exist.
- Using the size in cm: rejected, see above. Replaced by the 2026-11-12 amendment: only a difference of 2 cm or more splits a line, so 1 cm of drift does not.


## Amendment 2026-11-06: the Catalog fills an Edition Line from BnF

Series Onboarding (CORE-31) needs every Volume of an Edition Line, but a Catalog knew only the ISBNs readers had looked up (One Piece: 1 of 113). When the Volumes of an Edition Line are asked for, the Catalog now searches BnF by Series title and publisher (`bib.title all … and bib.publisher all …`, 50 records per page, at most 500), at most once a week per Edition Line, and asks Inventaire for the Works of the new ISBNs, 50 per request.

- An Edition counts when it has a Volume number, the Series title, the publisher and the language of the line, and the BnF Series record (461 `$0`) of the line, or none (limited to omnibus Editions by the 2026-11-12 amendment). One Edition per Volume number: one the Catalog has already, else the latest printing. Measured on 2026-11-06: One Piece, Glénat: 112 of 113 Volumes (BnF gives no Volume number for 13) in 7.5 s; Spy x Family, Kurokawa: 16 of 16.
- Like a lookup, nothing is stored when a source fails, so a listed Volume gets the Work identifier a lookup would give it. `/volumes` needs no sign-in, so calls at the same time for one Edition Line share one fill, and after a failed fill the sources are not asked again for an hour.
- Only a Series title and a publisher leave the server, never an ISBN a reader asked about, and they say nothing about who asked (ADR 0001).
- Rejected: a full lookup (four sources) per Volume, about 4 minutes for One Piece at one request per second per host; Inventaire's Series to Works links, 37 Works for One Piece.

## Amendment 2026-11-09: Loans, the end of a Copy, storage and Catalog access

**Loans replace Lent To.** `copy.lentTo` keeps only the current borrower, so each loan erases the last one. A sixth record type, `app.atomes.loan`, keyed by TID, holds one Loan: the Copy's record key, who has it (at most 64 graphemes), the date it was lent and, once it is back, the date it was returned. A Loan with no return date is open. `lentTo` is removed from `app.atomes.copy`. This breaks "add optional fields only" once, on purpose: no real record exists yet (real records start with ADR 0012), and no other app reads the lexicon. After the first real record the rule applies again. Loans hold names of people who are not readers, so the export and delete of ADR 0012 include them.

- Rejected: keep `lentTo` and add Loans, which would give two sources of truth for who has a Copy.

**The end of a Copy (later).** When the reader no longer has a Copy (sold, given, lost, never returned), the Copy is kept with an optional end date and reason, added as optional fields when a screen needs them. The Reading Status of its Works is unchanged, so the reader still sees what they read. From then on a Work is owned when it has a Copy with no end date. This one rule decides Owned-Unread, Missing Volumes, Shelf Check and Series counts, so it lives in one function.

**Storage.** Until Spaces is released these records are stored by the instance (ADR 0012), which also validates them against the lexicons. The device check above stays.

**Catalog access.** ISBN lookups stay open to anyone, with a limit per IP address. An Edition Line fill starts only for a signed-in reader (ADR 0013); for anyone else `/volumes` answers with what the Catalog already has. A fill is the costly call (up to 500 BnF records), and a stranger who triggers many of them gets the instance banned by the sources, not themselves.

## Amendment 2026-11-11: same_as links of a Series (CORE-42)

A Series used to keep the first identifier it got. When One Piece 112 (no Series link in any source) was looked up before 56, the Series got an `atomes:` identifier, and 56's `wd:Q673` and BnF Series record were lost. Decisions of the owner, 2026-11-11:

- **The Catalog answers with the best identifier it knows**, in the order of "Identifiers" above, and `series.sameAs` lists the others. When a shared identifier arrives for a Series found by its BnF Series record or its title, and that Series has only a minted identifier, the shared one becomes its main identifier and the minted one a `same_as` link. A Series with another shared identifier (`wd:Q1` and `wd:Q2`) is another Series, even with the same title. When a shared identifier and a title find two Series, they become one.
- **Reader records are never rewritten.** Reader code compares a record with a Series through `isSeries(series, id)` (`src/lib/library/ids.ts`), which accepts the main identifier and every `sameAs` one. A follow saved under an older identifier keeps it as its record key when the reader switches Edition Line or drops the Series. New follows get the best identifier.
- **Title.** When the Catalog knows a shared identifier, the Series title is that source's label (Inventaire, Wikidata). Every older title key still finds the Series. A typo with no shared identifier (SUDOC's "Aterix" for Asterix and the White Iris) is linked by the owner: `bun scripts/link-series.ts <id> <id>` on the Catalog file. The Series with the best identifier keeps it and its title. No fuzzy title match: it would join two different Series.
- **No Series endpoint.** The Catalog resolves an identifier internally (`series(id)`), and each Edition answer carries `sameAs`.
- **Storage.** A Series is an internal number. `series_link` holds every identifier of a Series, `series_title` every title key; Editions and the Edition Line key point at the number, so a link changes no Edition. The Catalog file holds minted identifiers that reader records use, so it is not a cache: its schema changes through numbered steps in `src/lib/catalog/migrations.ts` (`pragma user_version`), and a step is never edited once it has run.
- Rejected: keep the first identifier forever. It needs no reader change, but new records would keep identifiers that only one instance knows, and another Catalog could not resolve them.

## Amendment 2026-11-11: a reader picks the Series of an ISBN no source knows

A shelf check of 10 real ISBNs (PR #15) found 4 that no source knows, though BnF knows other books of the same Series or Work (Kaamelott 1 to 9, Casterman, but not 10). For such an ISBN, a signed-in reader can now search BnF by the title they typed and an optional publisher (`GET /api/catalog/search`, one page of 50 records), and pick an Edition Line and a Volume, or a book (`PUT /api/catalog/editions/{isbn}`).

- The Catalog keeps the pick as an Edition with the source `reader`: the Series, publisher and language of the picked Edition Line, the reader's Volume and title, the Work `isbn:<isbn>`, no cover. It never mixes reader data with source data. The pick joins the Edition Line (Kaamelott 1 to 10). It stores no DID or other reader data.
- A picked book gives its Work only when the sources share it (`wd:`, `inv:`, `ol:`); an `isbn:` Work belongs to the other Edition, so the reader types the book instead.
- The pick serves every reader of the instance. A later pick replaces it. The sources are asked about the ISBN again once a day, as for an unknown ISBN; when one knows it, its Edition replaces the pick whole.
- Only a signed-in reader may search or pick: both cost source calls, and a pick writes data every reader sees.
- What leaves the server: the title and publisher the reader typed, never the ISBN. They say nothing about who asked (ADR 0001).

## Amendment 2026-11-12: book size splits an Edition Line; the BnF Series record counts for omnibus Editions only

The owner's first real test found two faults in the Edition Line fill.

- **One Piece, Glénat, looked up from Volume 1 first: the fill kept 5 of 113 Volumes.** Volume 1 names BnF Series record 43702987, and Volume 56 (and most likely most of the run) names 38888890. The fill dropped every Edition with another 461 `$0` than the line's, so the result depended on the Volume a reader looked up first (112 of 113 when the first lookup was Volume 112 or 56).
- **Dragon Ball, Glénat: two Edition Lines became one.** Volume 1 is 18 cm (SUDOC). The fill added Volumes 2 to 34 at 21 cm (BnF), most likely the Perfect Edition (not checked against a source). Series Onboarding saved ISBNs of the 21 cm line for a reader of the 18 cm line.

Decisions of the owner, 2026-11-12:

- **Book size is part of the Edition Line.** An Edition whose height differs by 2 cm or more from the anchor's is in another Edition Line. A difference of 1 cm is drift inside one line (One Piece: 18 and 19 cm). An Edition with no size stays in the line. How the key holds the size is decided in code, with tests on recorded answers.
- **The BnF Series record counts for omnibus Editions only.** An omnibus Edition (several Volumes in one Copy, CORE-41) with another 461 `$0` than the line's is in another Edition Line (Dragon Ball Super, 45439866 and 45286066). An Edition of one Volume no longer needs the line's 461 `$0`.
- **Every Edition Line is filled again once** after the change: a migration step clears the record of past fills.
- **Reader records do not change**, because the Edition Line key is internal (see Identifiers). Copies already saved with an ISBN of the wrong line stay until the reader removes them.
- Rejected: the BnF Series record as the line key. One Piece has two Series records for one line.
- Rejected: title words ("Perfect Edition", "Deluxe"). No recorded answer shows them yet, and each publisher words them differently. The size is in most BnF and SUDOC records (215 `$d`).

How the Catalog does it (CORE-58, checked against the answers recorded on 2026-11-12):

- The Edition Line key ends with the line's book size: the size of the first Edition in it. An Edition joins the line nearest its size, within 1 cm; an Edition with no size joins the line with the most Editions. A chosen Volume (CORE-40) joins its anchor's line.
- The BnF Series record counts when the anchor or the listed Edition is an omnibus, so single Volumes stay out of an omnibus line (Dragon Ball Super) as omnibus Editions stay out of a single-Volume line.
- The line's record is the one most listed Editions of the anchor's kind name (One Piece: 38888890), whatever Volume was looked up first. When two Editions give one Volume number, the one in that record wins, else the latest printing: the One Piece "500 quiz book" (18 cm) and arc box sets (19 cm) have their own records and the same Volume numbers as the run.
- Recorded and not solved here: BnF files the 18 cm Dragon Ball Volumes as "Dragon Ball", and SUDOC calls Volume 1 "Dragonball", so the 18 cm line fills with Volume 1 only. One Piece 1 and 56 name two Wikidata Series (`wd:Q28667972`, `wd:Q673`).
