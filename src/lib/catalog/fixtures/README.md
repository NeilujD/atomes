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

The whole Edition Line of Spy x Family (Kurokawa), for the Catalog `volumes` tests, recorded on 2026-11-06 with `--fill`:

```sh
bun scripts/record-catalog-answers.ts --fill 9791042021030
```

| File | Answer |
|---|---|
| `bnf-search-0185efcb4147-1.xml` | BnF search `bib.title all "Spy x family" and bib.publisher all "Kurokawa"`: 25 records. Volumes 1 to 16, a second printing of Volume 11, another BnF Series with the same title, records with no Volume |
| `inventaire-batch-a9873a9f9bba.json` | Inventaire, 15 ISBNs in one request: 12 known (titles "Spy × Family, Tome 1"…), 3 unknown |

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

`catalog-v0.sqlite` is not a source answer: it is a Catalog file made on 2026-11-11 by the Catalog of `main` before `same_as` (commit a3f8d6c), from the recorded answers: One Piece 112, then 56, then the Spy x Family Edition Line with a fill. The migration tests open a copy of it. Never make it again: it stands for the files that real instances hold.

Review the diff before committing: answers change when the sources fix their data.
