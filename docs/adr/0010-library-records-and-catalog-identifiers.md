# Library records: five record types, Catalog identifiers and record keys

Status: accepted

The Library is stored as five record types, published as lexicons in `lexicons/app/atomes/` and listed in the Library Space (`app.atomes.library`). They follow ADR 0004 (own namespace, Editions by ISBN, Series by Catalog identifier) and ADR 0008 (an indexer can read them later without migration): records hold only ISBNs, Catalog identifiers and what the reader said, never data copied from the Catalog and never anything the app can compute.

| Record type | One record per | Record key | Holds |
|---|---|---|---|
| `app.atomes.copy` | Copy (two Copies of one Edition are two records) | TID | Edition ISBN, the Works it contains, Lent To, acquired date, book details typed by the reader when the Catalog does not know the ISBN |
| `app.atomes.readingStatus` | Work | Work identifier | Work, ISBN of the Edition read, status (unread, reading, read, abandoned), optional finish date |
| `app.atomes.follow` | Series | Series identifier | Series, anchor ISBN, optional `fromVolume`, status (following, dropped) |
| `app.atomes.toBuy` | Edition added by hand | ISBN-13 | ISBN |
| `app.atomes.label` | Label | TID | Name, the Works that carry it |

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
- **Edition Line is not stored.** A follow holds an anchor ISBN, an Edition in the Edition Line the reader collects. Every Catalog derives the Edition Line from it (Series, publisher, language; see the amendment below). Inside a Catalog the Edition Line key is internal and may change when the Catalog fixes its data.

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
- Using the size in cm: rejected, see above.

