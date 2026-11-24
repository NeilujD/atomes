# Search by title or author, from Inventaire then BnF, merged by ISBN

Status: accepted (2026-11-23); amended 2026-11-23 (Search is a mode of Check a book) and 2026-11-24 (a short story shows the book it is printed in). Amends ADR 0010 (what leaves the server) and the source order of spike 0002 (`docs/spikes/0002-catalog-sources-barcode-and-space-records.md`) for Search only. Built in milestone "M14 · Search". Spec: Linear document "Spec: M14 · Search".

A reader can add a book only with its barcode (Quick Add) or by typing its ISBN (To Buy). A reader who heard of a book and does not have it in their hands knows neither. The only search by words today is the BnF search by title and publisher of the amendment of 2026-11-11 to ADR 0010. Quick Add uses it for an ISBN that no source knows. It cannot find a Work under another title: "Dix petits nègres" (the old French title of Agatha Christie's novel) is "Ils étaient dix" in French since 2020, and "And Then There Were None" in English. It cannot search by author either. Decision (grilling of 2026-11-23, Q1 to Q25): **Search finds Works, Series and Authors by title or author words in one box. Inventaire finds the Work under any of its titles. The Editions of the Work come from Inventaire and BnF, merged by ISBN-13.**

## Evidence

A live spike of 2026-11-23 (User-Agent `Atomes-spike/0.1`, about 1 request/s per source) on the Christie test case:

- **Inventaire finds the Work under every title.** The search for Works (`/api/search?types=works`) gives the same Work `wd:Q214132` at rank 1 for "Dix petits nègres", "Ils étaient dix", "And Then There Were None" and "Ten Little Niggers". The Work keeps 59 labels, and aliases for each language (fr "Dix Petits Nègres", en "Ten Little Indians").
- **BnF links most French Editions to a Work authority.** The old records hold `500 $3 17796845`. `bib.work2bib any "17796845"` gives 37 records. The authority record lists the titles in each language (fr "Dix petits nègres" and "Ils étaient dix"). The records of "Ils étaient dix" from 2020 on have no 500, so `bib.work2bib` does not find them, but a title and author query does.
- **The two sources know different Editions.** Inventaire gives 41 Editions of the Work, 32 with an ISBN (20 French, 13 of them with an ISBN; 13 English). BnF gives 35 ISBNs. Only **9** ISBNs are in both.
- **BnF has limits for a search.** It returns 100 records at most for each call and does not sort (`sortKeys` changes nothing). A query on title words only brings noise (a 1683 atlas for "Ils étaient dix"). The language (`bib.language`), document type (`bib.doctype`) and date filters work. `bib.author all "Agatha Christie"` gives 1793 records. Inventaire knows 489 Works by her.
- **Volumes.** Inventaire keeps a Volume as a Work with a Series (`wdt:P179`) and a number (`wdt:P1545`): "Le Combat des chefs" is Astérix 7. In BnF, the Volume title is in 200 `$a` (Astérix) or there is a number only (One Piece, 200 `$h`, 461 `$v`).
- Opening one Work costs about 5–6 source calls.

## Decisions

**One box, three kinds of result.** The reader types title words, author words or both ("christie dix"). The results are Works, Series and Authors, never Editions. A Work shows once, whatever the title or the language of the words. Two Works that share an Edition ISBN (an Inventaire `inv:` Work and its `wd:` Work) merge into one row, and the row keeps the `wd:` identifier (ADR 0010: the best identifier).

**Inventaire first for Search; BnF stays first for an ISBN.** The search step asks Inventaire for Works, Series and Authors (one call). When Inventaire finds nothing, BnF gets `bib.title all <words> or bib.author all <words>`, printed text only, and its records are grouped into Works by Work authority (500 `$3`), else by title and author. The lookup of an ISBN keeps the order of spike 0002 (BnF, SUDOC, Inventaire, Open Library).

**The Editions of a Work come from three queries, merged by ISBN-13.** They are the Inventaire Editions of the Work (`wdt:P629`), BnF `bib.work2bib` on its Work authority, and one BnF title and author query, which finds the Editions with no Work link. An ISBN-10 changes to its ISBN-13. When two sources give the same ISBN, the Edition shows once. The server sorts the Editions newest first, by year of publication. Each Edition shows the title printed on it, so the 1940 Edition reads "Dix petits nègres". An Edition with no ISBN is not shown, because every reader record uses an ISBN-13 as its key (ADR 0010). One line gives their number. The Works of an Author come from Inventaire (`wdt:P50`), 20 for each page.

**The pick goes through the normal lookup.** Search stores nothing in the reader's records. When the reader picks an Edition, the app runs `lookup(isbn)`, as Quick Add does. The Catalog then stores the Edition, its Series and its Edition Line with the usual rules. The pick ends in "Add to To Buy" (the To Buy record of ADR 0010) or "I have it" (the Copy of Quick Add, then Series Onboarding).

**A cache of 24 hours.** A new Catalog table keeps each source answer of Search for 24 hours, keyed by the query. A second reader who opens the same Work makes no source call, so the instance stays near 1 request/s for each source. The table is a cache, not Catalog data: a migration may drop it. It holds no reader data.

**The Preferred Language picks the Editions.** It is kept on the device, the same as the app language, and follows the app language until the reader changes it. Search shows the Editions in the Preferred Language. When the typed words match a Work label in another language, which is not also the Work's label in the Preferred Language, the Editions in that language come in a second section ("English · matches your search"). "All languages" gives one list, with a language tag on each row. The server needs the language only for this sort. It is not stored.

**Only the typed words leave the server.** Search sends the words to Inventaire and BnF, never an ISBN of the Library and never who asked (ADR 0001, ADR 0012). Search needs a signed-in reader, as the current search does (401 otherwise): each search costs source calls. With no network, the screen says so and keeps the words. There is no cache of results on the device.

## Rejected

**BnF alone.** It finds the French Editions well, but not the other languages, and not the Editions of "Ils étaient dix" from 2020 on through the Work link. It has no sort, and its title search brings noise with no author.

**Inventaire alone.** It finds the Work under every title, but it has only 13 French Editions with an ISBN for the test Work, where BnF has 35 ISBNs.

**A flat list of Editions.** A renamed or translated book would show as several books, and the reader could not see that "Dix petits nègres" and "Ils étaient dix" are one Work.

**Wikidata directly.** Inventaire already holds the Wikidata Works and adds Editions to them. Wikidata has almost no French Editions (spike 0002).

**Covers in the Edition list.** 40 Editions would be 40 more source calls. The cover shows after the pick, from the normal lookup.

**Editions with no ISBN as reader records.** Every record uses an ISBN-13 as its key (ADR 0010). A key for an Edition with no ISBN would change the lexicons.

**Keep the Preferred Language in the Account.** It would need a new record or a new Account field. The app language is already kept on the device.

## Consequences

- ADR 0010: what leaves the server now also includes the title or author words of Search. They say nothing about who asked, as for the BnF search of 2026-11-11.
- Spike 0002: its source order stays for the lookup of an ISBN. Search uses Inventaire first.
- The current BnF search of Quick Add, for an ISBN that no source knows, stays as it is.
- `GLOSSARY.md` gets Search and Preferred Language. Shelf Check keeps "search" as a word to avoid: a Shelf Check is not a Search. Changed by the 2026-11-23 amendment below.
- The recorded source answers and the record script need the new Inventaire query shapes (search, reverse claims) and the BnF `bib.work2bib` query.
- The Privacy notice says nothing about book sources today, and Search sends no personal data, so it does not change.
- When Inventaire is down, Search still works from BnF, but finds fewer title variants and no other languages.

## Amendment 2026-11-23: Search is a mode of Check a book, and ends in the Shelf Check answer

Owner feedback (CORE-190): sometimes the barcode and the ISBN cannot be read (a gift, a price sticker over the code). The reader must still get a Shelf Check. Decision (grilling of 2026-11-23, Q3, Q4, Q9–Q15, Q19): **Search and Shelf Check are one feature. Check a book has two modes, Scan and Search, and an Edition picked in Search gets the same Shelf Check answer as a scan.**

- **One screen, two modes.** A switch at the top of `/check`: Scan | Search. The address holds the mode and the words (`/check?mode=search&q=dix+petits`), so Back from the answer and a reload keep the results. No mode is remembered: with no `mode`, the screen opens on Scan. `/search` sends to `/check?mode=search`, with its words.
- **One answer.** The pick runs the normal lookup of the ISBN, as a scan does, and shows the Shelf Check result screen: in your Library, read, missing from a Series, or not in your Library.
- **The main action follows the entry.** The answer of a book the reader does not own always has Add to To Buy. From To Buy (its "+" and its empty-list button, `from=to-buy`), Add to To Buy is the main action; from anywhere else, Add to Library is. The rule of the add is To Buy's (refused when the reader owns the Work or has it on To Buy). An owned answer has no Add to To Buy.
- **One typed-ISBN field**, in Scan mode only. The typed-ISBN field of the Search screen is removed: a known ISBN goes through Scan mode and its answer.
- **Offline.** Search mode says it needs a connection, keeps the words, and offers Scan. Scan mode keeps its offline answer from the device. Only the scan and the typed ISBN must work offline; Search offline from the device data is a follow-up (CORE-191).
- **No fuzzy matching of our own.** Inventaire already accepts "10" for "Dix", no accents, and the singular for the plural (live test of 2026-11-23: "10 petits negres" gives "Ils étaient dix" at rank 1). When nothing is found, the screen asks to check the spelling, or to try the author's name.
- Rejected: two screens, Search apart from Check a book. The reader would get two answers for one question, and Search would not tell what they own.
- `GLOSSARY.md`: Shelf Check is the answer (owned, read, missing); it starts from a scan, a typed ISBN or Search. "Search" leaves its words to avoid.

## Amendment 2026-11-24: a short story shows the book it is printed in

Owner test (CORE-193): Search "Agatha Christie" → her Author row → "Le Dieu solitaire" stopped on "no Edition with an ISBN". It is a short story (Inventaire `wdt:P7937` = `wd:Q49084`), never printed as a book of its own, so no source gives it an Edition. Inventaire says where it is printed: `wdt:P1433` (published in) = `wd:Q656127`, "Tant que brillera le jour", which has Editions with an ISBN. Decision: **when a Work has no Edition with an ISBN, Search reads its `wdt:P1433` and shows those books under "Printed in", as Work rows that open on their own Editions.**

- **Only on that path.** The Catalog reads `wdt:P1433` from the Work entity it already fetched for the Editions. The books cost one Inventaire batch call for their entities and one for their Authors, only for a Work with no Edition; the normal path asks nothing more. Each book identifier passes `isInventaireId` before it goes into a source URL. The 24-hour answer cache keeps these calls too.
- **A deeper step.** A book of "Printed in" opens its Editions as one more Search step; Back returns to the short story (the Search steps of `docs/design/ui-direction.md`).
- **Never stuck.** With no Edition and no book, the step keeps its message and offers Back and Scan the barcode.
- **The row says so.** A Work row of a short story (`wdt:P7937` holds `wd:Q49084`) shows a "Short story" tag, in the results and on an Author page; this reads the entity already fetched, with no request.
- Rejected: list the Editions of the book in place of the short story's. The reader would see Editions under a title they did not tap, with no word of why.
- ADR 0010: nothing new leaves the server. The only new identifiers sent are Inventaire Work identifiers that Inventaire itself gave.
- The record script gets `--editions <Work>`, which records the Editions of a Work and of each book it is printed in.
