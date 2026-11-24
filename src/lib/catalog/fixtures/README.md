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

Naruto (Kana, 18 cm), for one Edition Line under two publisher names (ADR 0010 amendment 2026-11-13), recorded on 2026-11-13:

```sh
bun scripts/record-catalog-answers.ts --fill 9782871294146
bun scripts/record-catalog-answers.ts 9782505009566
```

| ISBN or file | Answer |
|---|---|
| 9782871294146 | Naruto 1, publisher "Dargaud Bénélux-Kana", 2002: BnF finds no record by ISBN (0 answers); SUDOC gives the Series, Inventaire `wd:Q26971382` |
| 9782505009566 | Naruto 50, publisher "Kana", 2010: BnF Series record 38914962, as Volume 1 |
| `bnf-search-fe6c8f77dbc7-*.xml` (4 pages) | BnF search `bib.title all "Naruto" and bib.publisher any "dargaud benelux kana"`: 187 records. Volumes 1 to 22 as "Dargaud Bénélux-Kana", 23 to 72 as "Kana" (no Volume 20), the 22 cm Hokage edition, Boruto, Konoha shinden, novels |
| `inventaire-batch-02b8557b771b.json`, `inventaire-batch-4644dffc1872.json` | Inventaire, the Works of the listed Volumes |

Dragon Ball, Glénat, 18 cm, 1993 edition (BnF Series record 34338439), for one Work per Volume number (ADR 0010 amendment 2026-11-14, CORE-92), recorded on 2026-11-14:

```sh
bun scripts/record-catalog-answers.ts --fill 9782876952065
bun scripts/record-catalog-answers.ts 9782876952058 9782876952072 9782876952188 9782876952201 9782876952218
```

| ISBN or file | Answer |
|---|---|
| 9782876952058 | Dragon Ball 1, 1993: Inventaire Work `inv:31cee958a93ba50697a3fec2a32fc0c0` ("Sangoku"), its own |
| 9782876952065, 9782876952072 | Dragon Ball 2 (1993) and 3 (1996): Inventaire gives both the Work `inv:91e782c2fc0f67739836a22c452f3623` ("Dragon Ball, tome 2") |
| 9782876952188, 9782876952201, 9782876952218 | Dragon Ball 8 (1994), 10 and 11 (1996): the same Work again |
| `inventaire-batch-58b945484109.json` | Inventaire, the Volumes of the 1993 line the fill adds: the same Work for 4, 12 to 15, 20 to 23, 27 and 36. The `bnf-search-6dc7a6c70f8e-*.xml` pages are the "Dragon Ball" search above, recorded again with no change |

Edition Lines by BnF Series record (ADR 0010 amendment 2026-11-14, CORE-95), recorded on 2026-11-15: the fill now fills every line of a key (Dragon Ball 18 cm: 34338439, 38839216, 39250101; One Piece: the run, the "500 quiz book" and the arc box sets), keeps the printing nearest its record's median year, so it asks Inventaire about other ISBNs. The BnF answers did not change.

```sh
bun scripts/record-catalog-answers.ts --fill 9782876952065 9782723434621 9782723478991 9782723488525 9782203085053 9782723467681
```

| File | Answer |
|---|---|
| `inventaire-batch-136433ee9a4a.json`, `-1e5391afe7e6`, `-43f46d0233ff`, `-5429554c4b98`, `-5898b51497fd`, `-70426e667bda`, `-713a638d59e0`, `-a70a7ae34a20`, `-aba3b6c14c08`, `-d9bc78b58388` | Inventaire, the Works of the Volumes these fills add |

`catalog-v0.sqlite` is not a source answer: it is a Catalog file made on 2026-11-11 by the Catalog of `main` before `same_as` (commit a3f8d6c), from the recorded answers: One Piece 112, then 56, then the Spy x Family Edition Line with a fill. The migration tests open a copy of it. Never make it again: it stands for the files that real instances hold.

Review the diff before committing: answers change when the sources fix their data.

Search (ADR 0021, CORE-184), for `search.test.ts` and `e2e/search.spec.ts`, recorded on 2026-11-23 (BnF answered in about 15 s that day: the record script waits 60 s):

```sh
bun scripts/record-catalog-answers.ts --find "Dix petits nègres"
bun scripts/record-catalog-answers.ts --find "Ils étaient dix"
bun scripts/record-catalog-answers.ts --find "And Then There Were None"
bun scripts/record-catalog-answers.ts 9782253241782 9782253017097
```

| File | Answer |
|---|---|
| `inventaire-search-*.json` (3) | Inventaire search of Works and Authors for each title (`/api/search?types=works\|humans`, recorded again on 2026-11-24 for CORE-188): `wd:Q214132` first for all three |
| `inventaire-batch-*.json` | The Works and Authors of each search; the 41 Editions of `wd:Q214132` (32 with an ISBN, 9 with none) and their publishers and collections; the 2 Editions of `inv:9cc51ef9d8cd911a9eac07523f69232f` (same title and Author, no ISBN) |
| `inventaire-reverse-*.json` (2) | `wdt:P629` reverse claims of `wd:Q214132` and of `inv:9cc51ef9…` |
| `inventaire-wd-Q214132.json`, `inventaire-wd-Q35064.json` | The Work (BnF Work authority `wdt:P268` 17796845t) and Agatha Christie |
| `bnf-search-6cbd2c11433b-1.xml` | BnF `bib.work2bib any "17796845"`: 37 records, Editions to 2017, many with an ISBN-10 only |
| `bnf-search-fab986c2474c-1.xml` | BnF `bib.title adj "Ils étaient dix" and bib.author all "Agatha Christie" and bib.doctype any "a"`: 39 records, with the "Ils étaient dix" Editions of 2020 on (no Work link) |
| 9782253241782 | Ils étaient dix, Le Livre de poche, 2020: the Edition the E2E journey adds to To Buy |
| 9782253017097 | Dix petits nègres, Le Livre de poche, 1977: BnF holds only its ISBN-10 (2-253-01709-4) and finds it by the ISBN-10 only; unknown to Inventaire. Open Library did not answer (connection reset), so it has no file: "unknown" |

Merged by ISBN-13: 45 Editions (BnF 22, Inventaire 32, both 9), 23 with no ISBN (14 BnF records, 9 Inventaire Editions).

"I have it" in Search (CORE-185), for `e2e/search.spec.ts`, recorded on 2026-11-24:

```sh
bun scripts/record-catalog-answers.ts --find "Le Combat des chefs"
bun scripts/record-catalog-answers.ts --fill 9782012101395
```

| File | Answer |
|---|---|
| `inventaire-search-da941a96f5de.json` | Inventaire search "Le Combat des chefs" (Works and Authors, `types=works|humans`; recorded again for CORE-188's search URL): `wd:Q1194700` (Goscinny, Uderzo, 1966) first, then 3 Inventaire Works of the same album and other books; no Author holds every word |
| `inventaire-batch-*.json` (7), `inventaire-reverse-605feadb1945.json`, `inventaire-wd-Q1194700.json`, `inventaire-wd-Q192214.json` | The Works and Authors of the search, the `wdt:P629` Editions of `wd:Q1194700` and their publishers, the Work and René Goscinny |
| `bnf-search-db1ebf3c9471-1.xml` | BnF `bib.title adj "Le Combat des chefs" and bib.author all "René Goscinny" and bib.doctype any "a"` |
| 9782012101395 | Le combat des chefs, Hachette, 2005 ("Une aventure d'Astérix"): Astérix 7 (Inventaire `wd:Q42490`), the Edition the E2E journey says "I have it" for |
| `bnf-search-98906e501fb5-*.xml` (5 pages) | The BnF Series search of the `--fill`: its Edition Line holds Volume 7 only, enough for Series Onboarding to open |

Merged by ISBN-13: 14 Editions with an ISBN, 5 with none.

Search by Author, mixed words and the BnF fallback (CORE-188), for `search.test.ts` and `e2e/search-author.spec.ts`, recorded on 2026-11-24. The files of the 3 Christie searches of 2026-11-23 stayed as recorded then:

```sh
bun scripts/record-catalog-answers.ts --find "Agatha Christie"
bun scripts/record-catalog-answers.ts --find "christie dix"
bun scripts/record-catalog-answers.ts --find "Alexandre Dumas"
bun scripts/record-catalog-answers.ts --find "Plouguerneau"
```

| File | Answer |
|---|---|
| `inventaire-search-*.json` (4) | "Agatha Christie": Works, `wd:Q35064` and 2 `inv:` Authors of the same name with no birth year. "christie dix": `wd:Q214132` first, Authors without "dix" in their name. "Alexandre Dumas": `wd:Q38337` (1802) and `wd:Q169150` (1824), both named "Alexandre Dumas". "Plouguerneau": no result |
| `inventaire-author-works-*.json` (9) | `action=author-works` of each Author: 385 Works for `wd:Q35064`, 309 for `wd:Q38337`, 11 for `wd:Q169150`, 1 for the `inv:` Authors, none for Authors with no Work |
| `inventaire-batch-*.json` | The Works and Authors of each search; pages 1 and 2 of the Works of Agatha Christie and of `wd:Q38337`; the Editions of `wd:Q141526821` (And Then There Were None, 2025, first of page 1) and of `inv:7bc1d7a89950b1f391aeb99029439e63` |
| `inventaire-reverse-*.json` (2), `inventaire-wd-Q141526821.json`, `inventaire-inv-*.json`, `inventaire-wd-Q38337.json` | The Editions and the Work of the first Work of page 1 of each Author |
| `bnf-search-*.xml` (4) | BnF `(bib.title all "Plouguerneau" or bib.author all "Plouguerneau") and bib.doctype any "a"`: 52 records, 2 with a Work authority (500 `$3` 87198521, 87198539); `bib.work2bib any "87198521"`; the BnF title and author queries of the first Works of page 1 |

Series and Volumes (CORE-187), for `search.test.ts` and `e2e/search-series.spec.ts`, recorded on 2026-11-24. Only the files these tests read were kept:

```sh
bun scripts/record-catalog-answers.ts --find "Astérix"
bun scripts/record-catalog-answers.ts --series wd:Q42490 7
bun scripts/record-catalog-answers.ts --find "One Piece"
bun scripts/record-catalog-answers.ts --series wd:Q28667972 56
```

| File | Answer |
|---|---|
| `inventaire-search-*.json` (4) | The Works and Authors search (`types=works\|humans`) and the Series search (`types=series`) of "Astérix" and of "One Piece". "Astérix": `wd:Q42490` Astérix, `wd:Q1469187` (Kauka adaptations) and `wd:Q104843697` (Asterix Omnibus), which BnF lists no Edition Line of. "One Piece": `wd:Q28667972` first, then lists of anime episodes |
| `bnf-search-*.xml` | BnF `bib.title all "Astérix" and bib.doctype any "a"` (588 records, the first 100): 6 Edition Lines with a Volume number (Hachette · 2001–2004 among them). The same for "One Piece" (5 Glénat lines). The BnF Work and title queries of Volume 7 (`wd:Q1194700`) and Volume 56 |
| `inventaire-reverse-*.json`, `inventaire-batch-*.json`, `inventaire-inv-*.json`, `inventaire-wd-Q2010.json` | The Volumes of each Series (`wdt:P179`): Astérix 1 to 41 and 11 Works with no number ("Le Menhir d'or"), One Piece by number; the Editions of Volume 7 and of One Piece 56 and their publishers; Eiichirō Oda |

Volume 7, merged by ISBN-13: the Hachette Editions of 2001 to 2025 named "Hachette · 2001–2004", the line BnF lists; Dargaud 1984 in "Dargaud · 1982–1984". One Piece 56, Glénat 2011 (9782723478991): number 56, no Volume title (BnF 200 `$a` is "One Piece").

A short story printed in a book of stories (CORE-193), for `search.test.ts` and `e2e/search-story.spec.ts`, recorded on 2026-11-24:

```sh
bun scripts/record-catalog-answers.ts --editions wd:Q17177225
bun scripts/record-catalog-answers.ts 9780002326438
```

| File | Answer |
|---|---|
| `inventaire-wd-Q17177225.json`, `inventaire-reverse-*.json`, `bnf-search-*.xml` | "Le Dieu solitaire" (short story, `wdt:P7937` `wd:Q49084`; printed in `wdt:P1433` `wd:Q656127`): no Inventaire Edition, BnF 0 records |
| `inventaire-wd-Q656127.json`, `inventaire-reverse-*.json`, `inventaire-batch-*.json` (2), `bnf-search-*.xml` | "Tant que brillera le jour" (`wd:Q656127`): 4 Inventaire Editions and their Works, BnF records by title and Author; 10 Editions with an ISBN, merged. BnF also gives "Miss Marple tire sa révérence" (France Loisirs) under that title |
| 9780002326438 | While the Light Lasts and Other Stories, HarperCollins, 1997: the Edition the E2E journey picks (English, the reader's Preferred Language); BnF, Inventaire (Work `wd:Q656127`) and Open Library know it, SUDOC does not |
