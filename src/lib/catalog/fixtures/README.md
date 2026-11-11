# Recorded source answers

Real answers of BnF, SUDOC, Inventaire and Open Library, recorded on 2026-11-05, used by `src/lib/catalog/catalog.test.ts` through `recorded.fake.ts`. A URL with no file here answers 404, the way the sources say "unknown".

Record them again, or add ISBNs:

```sh
bun scripts/record-catalog-answers.ts 9782723478991 9782344068922 9791042021030 9782072927515 9780000000002 9791099999993
```

| ISBN | Book | Why |
|---|---|---|
| 9782723478991 | One Piece 56, Glénat | BnF + Inventaire: Series `wd:Q673`, Work, cover |
| 9782344068922 | One Piece 112, Glénat, 2026 | No 461 in any source; same Edition Line as 56 (sizes differ) |
| 9791042021030 | Spy x Family 16, Kurokawa, 2026 | BnF has no 461 yet (two records); SUDOC gives the Series |
| 9782072927515 | La Horde du Contrevent, Folio SF | Standalone novel; BnF 225 publisher collection (n° 271) is not a Series |
| 9780000000002 | three different books | SUDOC, Inventaire and Open Library disagree: only the first source is used |
| 9791099999993 | none | Valid check digit, unknown to every source |
| 9782380714487 | Spy x Family Tomes 1 à 3, Kurokawa, 2022 (recorded 2026-11-11) | Omnibus of Volumes 1 to 3 (461 `$v` "1-3"), in its own BnF Series record 47217506 |

The whole Edition Line of Spy x Family (Kurokawa), for the Catalog `volumes` tests, recorded on 2026-11-06 with `--fill`:

```sh
bun scripts/record-catalog-answers.ts --fill 9791042021030
```

| File | Answer |
|---|---|
| `bnf-search-0185efcb4147-1.xml` | BnF search `bib.title all "Spy x family" and bib.publisher all "Kurokawa"`: 25 records. Volumes 1 to 16, a second printing of Volume 11, the omnibus of Volumes 1 to 3 in another BnF Series record, records with no Volume |
| `inventaire-batch-a9873a9f9bba.json` | Inventaire, 15 ISBNs in one request: 12 known (titles "Spy × Family, Tome 1"…), 3 unknown |

The omnibus line of Dragon Ball Super (Glénat), recorded on 2026-11-11 with `--fill` (CORE-41):

```sh
bun scripts/record-catalog-answers.ts --fill 9782344025437
```

| File | Answer |
|---|---|
| `bnf-9782344025437.xml`, `inventaire-isbn-…`, `openlibrary-…` | Dragon ball super Tomes 1-2 (200 `$h` "Tomes 1-2", 461 `$v` "1-2", BnF Series record 45439866); unknown to Inventaire and Open Library |
| `bnf-search-21b6cd8d4162-1.xml` | BnF search `bib.title all "Dragon ball super" and bib.publisher all "Glénat"`: 44 records. Omnibus Tomes 1-2, 3-4, 5-6 and 7-8 in 45439866; single Volumes 1 to 24 in another BnF Series record (45286066); other books |
| `inventaire-batch-3101fbe60f68.json` | Inventaire, the 3 other omnibus ISBNs: all unknown |

Search and batch files are named by a hash of the query (`recorded.fake.ts`).

Review the diff before committing: answers change when the sources fix their data.
