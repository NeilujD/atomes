# Recorded source answers

Real answers of BnF, SUDOC, Inventaire and Open Library, recorded on 2026-11-05, used by `src/lib/catalog/catalog.test.ts` through `recorded.fake.ts`. A URL with no file here answers 404, the way the sources say "unknown".

The dev server answers from them too, with no network: `CATALOG_SOURCES=recorded DATA_DIR=data-e2e bun run dev` (`src/lib/catalog/instance.ts`). A built server never holds them.

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

Kaamelott (Casterman), for the Catalog `search` and `choose` tests (CORE-40), recorded on 2026-11-11:

```sh
bun scripts/record-catalog-answers.ts --search "Kaamelott" "Casterman"
bun scripts/record-catalog-answers.ts --fill 9782203085053
bun scripts/record-catalog-answers.ts 9782203255647 9782265144026
bun scripts/record-catalog-answers.ts --search "Réglez-lui son compte" "Fleuve"
```

| ISBN or file | Answer |
|---|---|
| 9782203255647 | Kaamelott 10, Casterman (owner's shelf): unknown to all four sources (BnF 0 records, SUDOC 404) |
| 9782203085053 | Kaamelott 9, Casterman: the anchor of the Edition Line; the `--fill` Inventaire batch gives the Works of 1 to 8 |
| `bnf-search-b2edb89b86f9-1.xml` | BnF search `bib.title all "Kaamelott" and bib.publisher all "Casterman"`: 13 records, Volumes 1 to 9, two printings of 1, 2 and 3, one record with no Volume |
| `bnf-search-cb50c926699d-1.xml` | BnF search `bib.title all "Réglez-lui son compte" and bib.publisher all "Fleuve"`: two Editions (1981, 2019), no Series |
| 9782265144026 | Réglez-lui son compte !, Fleuve noir, 2019: no shared Work in any source |

Search and batch files are named by a hash of the query (`recorded.fake.ts`).

Recorded on 2026-11-11 for the `same_as` tests (CORE-42):

```sh
bun scripts/record-catalog-answers.ts 9781408730218 9782864976165
```

| ISBN | Book | Why |
|---|---|---|
| 9781408730218 | Asterix and the White Iris, Sphere, 2023 | SUDOC's Series is "Aterix" (a typo), with no shared identifier |
| 9782864976165 | L'Empire du Milieu, album of the film, Albert René | Inventaire gives the Series Astérix, `wd:Q42490` |

Recorded on 2026-11-12 for the Edition Lines by book size (CORE-58, ADR 0010 amendment 2026-11-12):

```sh
bun scripts/record-catalog-answers.ts --fill 9782723488525
bun scripts/record-catalog-answers.ts --fill 9782723434621
bun scripts/record-catalog-answers.ts --fill 9782723467681
bun scripts/record-catalog-answers.ts --search "One Piece" "Glénat"
bun scripts/record-catalog-answers.ts --search "Dragon Ball" "Glénat"
```

| ISBN or file | Answer |
|---|---|
| 9782723488525 | One Piece 1, Glénat, 2013 printing, 18 cm: BnF Series record 43702987 (56 names 38888890); Inventaire Series `wd:Q28667972` (56 says `wd:Q673`) |
| `bnf-search-afb70bc46184-*.xml` (5 pages) | BnF search `bib.title all "One Piece" and bib.publisher all "Glénat"`: 242 records. The run, 18 cm (18 x 11 to 18 x 13 cm, 112 at 19 cm), names 38888890, 43702987 (Volume 1), 46917823 (98 to 100) or no record (105 on); no Volume 13. Same title and size, not the run: "500 quiz book" 2 and 3 (47171632, 18 cm), arc box sets 1 to 6 (46972617, 19 and 20 cm, 12 or 13 Volumes each). Other sizes: 30 cm (40924513), 26 cm magazine, 17 cm Vivre Cards |
| 9782723434621 | Dragon Ball 1 "Son Goku", Glénat, 18 cm: BnF has no record (0 answers); SUDOC's Series is "Dragonball", with no Series record |
| 9782723467681 | Dragon Ball 1, Glénat, 21 cm, BnF Series record 41495473 (most likely the Perfect Edition; Inventaire calls it so, a title BnF does not give) |
| `bnf-search-9324fcaa8026-*.xml` (2 pages) | BnF search `bib.title all "Dragonball" and bib.publisher all "Glénat"`: 98 records. Volumes 1 to 34 at 21 cm (no 14, 17, 21), Dragonball Z and SD lines (other Series titles); no 18 cm "Dragonball" record with a Volume |
| `bnf-search-6dc7a6c70f8e-1.xml` | BnF search `bib.title all "Dragon Ball" and bib.publisher all "Glénat"`, first page: the 18 cm Volumes are filed as "Dragon Ball" (1993 to 2008 printings, 2026 reprints), not "Dragonball". Not used by a test: a fill from SUDOC's "Dragonball" does not find them |
| `inventaire-batch-25f9d8a6a929.json`, `inventaire-batch-31ae450786a2.json` | Inventaire, the Works of the listed One Piece and Dragon Ball 21 cm ISBNs |

`catalog-v0.sqlite` is not a source answer: it is a Catalog file made on 2026-11-11 by the Catalog of `main` before `same_as` (commit a3f8d6c), from the recorded answers: One Piece 112, then 56, then the Spy x Family Edition Line with a fill. The migration tests open a copy of it. Never make it again: it stands for the files that real instances hold.

Review the diff before committing: answers change when the sources fix their data.
