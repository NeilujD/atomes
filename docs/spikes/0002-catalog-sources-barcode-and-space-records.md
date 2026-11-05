# Spike: Catalog sources, barcode scanning and Space records

Linear: CORE-22. Researched 2026-11-05. All web sources were opened on that date. All API calls were real calls from a headless Chrome, with a pause of at least 1.1 s between two calls to the same host. Atproto code was read at `permissioned-data` head [`ae214a4`](https://github.com/bluesky-social/atproto/commit/ae214a440e0113941f771e9fe0f6af92c1d03433) (2026-11-04).

## TL;DR

- **Catalog v0 source order: BnF SRU → SUDOC → Inventaire → Open Library.** BnF found **20 of 20** sample ISBNs. The next best open source found 14 of 20. No open source gives covers for recent French manga.
- **No source models the Edition Line.** Atomes must build it. Reader records keep only ISBNs and a Series identifier. The Catalog derives the Edition Line from an anchor ISBN (section 2, input for ADR 0010).
- **Barcode: native `BarcodeDetector` when it lists `ean_13`, else `barcode-detector@3.2.3` (MIT, zxing-wasm).** iPhones always use the fallback: **about 445 KB gzip** on the first scan. We host the `.wasm` ourselves, and the service worker caches it for offline Shelf Check.
- **`community.lexicon.book.status` does not exist.** The Space could list it, but there is no schema to follow. ADR 0004 is amended: Reading Status uses `app.atomes.readingStatus`.
- **Blobs in a Space: yes, and they stay private.** This needs one more OAuth scope, `blob:image/*`, so the reader must sign in again once.
- **New Space collections reach open sessions at the next token refresh**, without a new sign-in. The worst case is about 65 minutes.

## 1. Open book data

### Sources

| Source | Data licence | Cover images | Rate limits and headers | Series and Volume field | Subjects (for Label suggestions) |
|---|---|---|---|---|---|
| [BnF SRU](https://api.bnf.fr/fr/api-sru-catalogue-general) 1.2, `unimarcXchange` | [Licence Ouverte / Etalab](https://www.bnf.fr/fr/conditions-de-reutilisations-des-donnees-de-la-bnf#:~:text=sous%20la%20%C2%AB%20Licence%20Ouverte%20%2F%20Open%20Licence%20%C2%BB): give the source and the date | None | No figure published; max 1000 records per call | UNIMARC **461** `$t` title, `$v` number, `$0` Series record (corrected 2026-11-05: recorded answers use `$0`, not `$3`). 225/410 are publisher collections (Folio, Pika Shônen), not Series. Fallback number: 200 `$h` | RAMEAU (606, 608) |
| SUDOC (ABES): `isbn2ppn`, then the UNIMARC record | [Licence Ouverte](https://abes.fr/reseau-sudoc/reutiliser-les-donnees-sudoc/formats-de-donnees-disponibles/#:~:text=sous%20Licence%20Ouverte%20%2F%20Open%20Licence) | None | No figure found | 461 `$t`/`$v`, title only (no link) | RAMEAU, richer than BnF (e.g. "Football / Mangas / Shônen") |
| [Inventaire](https://api.inventaire.io/) 5.1.1, `entities/by-uris` | [CC0](https://wiki.inventaire.io/wiki/Entities_data#:~:text=published%20under%20a%20CC0%20license) | Licence not stated | Asks for a User-Agent with a contact URL; returns 429, no figure | `wdt:P179` Series (`wd:Q…` or `inv:…`), `wdt:P1545` number | Genres `wdt:P136` |
| [Open Library](https://openlibrary.org/developers/api) | [No new rights asserted](https://openlibrary.org/developers/licensing#:~:text=does%20not%20assert%20any%20new%20copyright) | No licence; [100 requests per IP per 5 min](https://openlibrary.org/dev/docs/api/covers#:~:text=Currently%20only%20100%20requests%2FIP%20are%20allowed%20for%20every%205%20minutes) | [1 request/s anonymous](https://openlibrary.org/developers/api#:~:text=Default%20(non-identified%20requests)%3A%201%20request%20per%20second); 3/s only with an email | Only through `search.json`: `series_key`, `series_name`, `series_position`. The edition `series` field was empty for all 20 | Work subjects |
| data.bnf.fr SPARQL | Licence Ouverte | None | — | None | — |
| Wikidata SPARQL | [CC0](https://www.wikidata.org/wiki/Wikidata:Licensing#:~:text=Wikidata%20requires%20a%20CC0%20license) | Commons, licence per file | [60 s of processing per minute, 5 parallel queries](https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual#:~:text=One%20client%20(user%20agent%20%2B%20IP)%20is%20allowed%2060%20seconds%20of%20processing%20time) | `P179` + `P1545` | `P136` |
| BookBrainz API v1 | [CC0](https://bookbrainz.org/licensing#:~:text=licensed%20under%20the%20Creative%20Commons%20CC0%20license) | None | — | No lookup by ISBN | — |
| Google Books v1 (comparison only) | [No fees without Google's permission](https://developers.google.com/books/terms#:~:text=You%20may%20not%20charge%20users%20any%20fee) | Google's | Anonymous calls share one daily quota | Not measured | — |

Google Books is not an open source, and its terms do not fit an open, self-hosted project (ADR 0005). All 20 calls returned HTTP 429 "Queries per day" without an API key.

### Sample: 20 ISBNs

All 20 come from BnF search results, have a valid check digit and exist in BnF: 8 manga (4 with prefix 979-10), 6 BD, 6 novels; 6 are 2025–2026 releases.

Cell: found / **S** Series / **V** Volume number / **C** cover / **P** publisher. `✗` = ISBN not found. A Series counts only when it is a real Series link (UNIMARC 461 or Wikidata `P179`), not a publisher collection.

| # | ISBN | Type | Title, publisher, year | BnF SRU | SUDOC | Inventaire | Open Library | data.bnf.fr |
|---|---|---|---|---|---|---|---|---|
| 1 | 9782723478991 | manga | One Piece 56, Glénat, 2011 | ✓ S✓ V✓ C✗ P✓ | ✗ | ✓ S✓ V✓ C✓ P✗ | ✗ | ✓ S✗ |
| 2 | 9782505004172 | manga | Naruto 39, Kana, 2008 | ✓ S✓ V✓ C✗ P✓ | ✓ S✓ V✓ C✗ P✓ | ✓ S✓ V✓ C✓ P✓ | ✓ S✗ V✗ C✓ P✓ | ✓ S✗ |
| 3 | 9782811630997 | manga | Fairy Tail + (special), Pika, 2016 | ✓ S✓ V✗ C✗ P✓ | ✗ | ✓ S✓ V✗ C✓ P✓ | ✓ S✗ V✗ C✓ P✓ | ✓ S✗ |
| 4 | 9791032713662 | manga | Frieren 10, Ki-oon, 2023 | ✓ S✓ V✓ C✗ P✓ | ✓ S✓ V✓ C✗ P✓ | ✓ S✓ V✓ C✓ P✓ | ✗ | ✓ S✗ |
| 5 | 9791032722077 | manga | Jujutsu Kaisen Modulo 1, Ki-oon, 2026 | ✓ S✗ V✓ C✗ P✓ | ✗ | ✗ | ✗ | ✗ |
| 6 | 9791042021030 | manga | Spy x Family 16, Kurokawa, 2026 | ✓ S✗ V✓ C✗ P✓ | ✓ S✓ V✓ C✗ P✓ | ✗ | ✗ | ✗ |
| 7 | 9782413028581 | manga | Food Wars 36, Delcourt-Tonkam, 2020 | ✓ S✓ V✓ C✗ P✓ | ✓ S✗ V✓ C✗ P✓ | ✗ | ✗ | ✓ S✗ |
| 8 | 9791043306471 | manga | Blue Lock 33, Pika, 2026 | ✓ S✗ V✓ C✗ P✓ | ✓ S✓ V✓ C✗ P✓ | ✗ | ✗ | ✗ |
| 9 | 9782205071801 | BD | Blacksad 5, Dargaud, 2013 | ✓ S✓ V✓ C✗ P✓ | ✓ S✗ V✓ C✗ P✓ | ✓ S✓ V✓ C✓ P✓ | ✓ S✗ V✗ C✓ P✓ | ✓ S✗ |
| 10 | 9782800159065 | BD | Gaston 1, Dupuis, 2013 | ✓ S✓ V✓ C✗ P✓ | ✗ | ✗ | ✓ S✗ V✗ C✗ P✗ | ✓ S✗ |
| 11 | 9782808202923 | BD | Thorgal Saga: Shaïgan, Le Lombard, 2024 | ✓ S✓ V✗ C✗ P✓ | ✓ S✗ V✓ C✗ P✓ | ✓ S✓ V✓ C✓ P✓ | ✗ | ✓ S✗ |
| 12 | 9782203019997 | BD | Tintin en Amérique, Casterman, 2010 | ✓ S✓ V✗ C✗ P✓ | ✓ S✓ V✗ C✗ P✓ | ✗ | ✗ | ✓ S✗ |
| 13 | 9782017253716 | BD | Astérix en Lusitanie, Hachette, 2025 | ✓ S✓ V✗ C✗ P✓ | ✗ | ✗ | ✓ S✗ V✗ C✓ P✓ | ✓ S✗ |
| 14 | 9782413076162 | BD | Les Légendaires 10, Delcourt-Tonkam, 2025 | ✓ S✓ V✓ C✗ P✓ | ✗ | ✗ | ✗ | ✓ S✗ |
| 15 | 9782070348633 | novel | L'Étranger (Folio), Gallimard, 2007 | ✓ S✗ V✗ C✗ P✓ | ✓ S✗ V✗ C✗ P✓ | ✓ S✗¹ C✓ P✓ | ✗ | ✓ S✗ |
| 16 | 9782072764929 | novel | Chanson douce (Folio), Gallimard, 2018 | ✓ S✗ V✗ C✗ P✓ | ✓ S✗ V✗ C✗ P✓ | ✓ S✗¹ C✓ P✗ | ✓ S✗ V✗ C✓ P✓ | ✓ S✗ |
| 17 | 9782266320542 | novel | Dune (Pocket), 2021 | ✓ S✓ V✓ C✗ P✓ | ✓ S✗ V✓ C✗ P✓ | ✓ S✓ V✓ C✓ P✓ | ✓ S✓ V✓ C✓ P✓ | ✓ S✗ |
| 18 | 9782253098959 | novel | Le Parfum, Le Livre de Poche, 2015 | ✓ S✗ V✗ C✗ P✓ | ✓ S✗ V✗ C✗ P✓² | ✗ | ✓ S✗ V✗ C✓ P✓ | ✓ S✗ |
| 19 | 9782075094559 | novel | Harry Potter à l'école des sorciers, Gallimard Jeunesse, 2018 | ✓ S✓ V✗ C✗ P✓ | ✓ S✓ V✓ C✗ P✓ | ✓ S✓ V✓ C✓ P✓ | ✓ S✓ V✓ C✓ P✓ | ✓ S✗ |
| 20 | 9782707356741 | novel | La Maison vide, Minuit, 2025 | ✓ S✗ V✗ C✗ P✓ | ✓ S✗ V✗ C✗ P✓ | ✓ S✗ V✗ C✓ P✗ | ✓ S✗ V✗ C✓ P✓ | ✓ S✗ |

¹ Inventaire returns a false Series: "philosophie d'Albert Camus" (#15) and "Collection Blanche", a publisher collection (#16).
² SUDOC returned two records for #18; the first is a 1986 Fayard edition, so the wrong Edition.

Wikidata, BookBrainz and Google Books found 0 of 20 (Google: HTTP 429).

### Coverage (out of 20)

| Source | Found | Series | Volume | Cover | Publisher | 979-10 (of 4) | 2025–26 (of 6) |
|---|---|---|---|---|---|---|---|
| BnF SRU | **20** | 13 | 12 | 0 | 20 | 4 | 6 |
| SUDOC | 14 | 6 | 9 | 0 | 14 | 3 | 3 |
| Inventaire | 11 | 8 | 7 | **11** | 8 | 1 | 1 |
| Open Library | 10 | 2 | 2 | 9 | 9 | 0 | 2 |
| data.bnf.fr | 17 | 0 | 0 | 0 | 17 (free text) | 1 | 3 |
| Wikidata, BookBrainz | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

Findings:

- **BnF is the authority.** It is the legal deposit, and it is the only source that found every ISBN, including all 979-10 ISBNs and all 2025–2026 releases.
- **The newest BnF records have no Series link yet.** Jujutsu Kaisen Modulo 1, Spy x Family 16 and Blue Lock 33 (2026) have no 461. The Volume number still comes from 200 `$h`. **SUDOC fills this gap**: BnF and SUDOC together give a Series for 15 of 20.
- BnF gives no Volume number for Astérix, Tintin, Thorgal Saga or Harry Potter.
- **Wikidata has almost no French editions**: about 13,000 items have both an ISBN-13 and the language French, and 656 items in all of Wikidata have a 979-10 ISBN. The query works: a known ISBN round-trips. Wikidata is useful for Works and Series, through Inventaire, not for lookup by ISBN.
- **Inventaire adds editions on top of Wikidata.** Its editions point to Wikidata Works and Series (One Piece `wd:Q673`, Frieren `wd:Q98642652`). It is the best cover source (11 of 20).
- **Open Library has had a Series entity since 2026** (`/series/OL326110L`), but it appears only in `search.json`.
- **Covers are the weak point.** BnF and SUDOC have none. No source had a cover for the three 2026 manga. No source states a cover licence.
- Volume values need normalisation: "[5]", "[Tome 3]", "I".

### Recommended source order for Catalog v0

1. **BnF SRU**, `bib.isbn adj "<isbn>"`. Edition, publisher, language, format (010 `$b`, 215 `$d`), Series and number (461), RAMEAU subjects.
2. **SUDOC**, for the 461 Series and Volume when BnF has none (recent records). Check that the record's ISBN matches; `isbn2ppn` can return more than one record.
3. **Inventaire**, for Work and Series as Wikidata identifiers (stable across instances) and for the cover.
4. **Open Library**, for a cover when Inventaire has none, and for `series_position`.
5. **Owner's photo** when no source has a cover (ADR 0003 exception; section 5).

Do not use for v0: data.bnf.fr (no Series, misses 2026 releases), Wikidata by ISBN, BookBrainz, Google Books.

The Catalog server makes these calls, not the browser, so that it can send its own User-Agent (`Atomes/<version> (+<instance URL>)`, no email) and cache the results. Stay at about 1 request/s per source: BnF, SUDOC and Inventaire publish no figures. Show the source and date of each fact (Licence Ouverte asks for it).

## 2. Catalog identifiers (input for ADR 0010)

Constraints: each self-hosted instance has its own Catalog database (ADR 0004, ADR 0007). Reader records must stay valid when the reader changes instance, and must stay indexable later (ADR 0008). The Coolify staging Catalog is one more instance, so no identifier can depend on one Catalog database.

What the sources give:

| Source | Series | Work | Edition |
|---|---|---|---|
| BnF | 461 `$0`: record of the French publication of the Series (One Piece `38888890` → ark). Probably closer to an Edition Line than to a Series; not confirmed | None | ark, e.g. `ark:/12148/cb43407362n` |
| Wikidata / Inventaire | `wd:Q673` or `inv:<32 hex>` | `wd:Q…` or `inv:…` | Inventaire `isbn:` URI |
| Open Library | `/series/OL…L` | `/works/OL…W` | `/books/OL…M` |
| SUDOC | Title only | None | PPN |

No source identifies an Edition Line.

### Proposal

1. **Edition = ISBN-13**, 13 digits without hyphens. No change from ADR 0004.
2. **An identifier is a prefixed string `<scheme>:<value>`.** Schemes, in order of preference when the Catalog chooses one for a new Series or Work:
   - `wd:Q…`: Wikidata. Global, CC0, used by Inventaire.
   - `inv:<hash>`: Inventaire entity not yet in Wikidata.
   - `ol:OL…L` / `ol:OL…W`: Open Library.
   - `atomes:<instance host>:<ULID>`: minted by a Catalog instance when no source knows the entity. The host makes it unique across instances.
3. **An identifier never changes after a reader record uses it.** Each Catalog keeps a `same_as` table: when it learns that `atomes:catalog.example:01J…` and `wd:Q123` are the same Series, it links them. It never rewrites reader records. Any instance resolves any identifier it has a `same_as` link for, and fetches unknown `wd:`, `inv:` and `ol:` identifiers from their source.
4. **Edition Line is not stored in reader records.** A Followed Series record holds the Series identifier and an **anchor ISBN** (an Edition the reader owns), plus `fromVolume` when the reader switches Edition Line. Every Catalog derives the Edition Line from the anchor Edition: publisher, language and format. Inside one Catalog, the Edition Line key is `<series id> + <publisher> + <language> + <format>`. It is an internal key, so it may change when the Catalog fixes its data.
5. **Work in reader records is optional.** A Reading Status always holds the ISBN of the Edition the reader read, and the Work identifier when the Catalog knows one. The Catalog finds the other Editions of the same Work.

Why: reader data then holds only ISBNs and global identifiers, which every instance and a later indexer can resolve. The uncertain part, how to group Editions into Edition Lines, stays in the Catalog, where a fix needs no change in readers' repos (the reason behind ADR 0004).

Open points for ADR 0010:

- `atomes:` identifiers depend on the minting host staying alive. A Catalog that cannot resolve one shows the Series from the reader's own records (title on the Copy), and links it later through `same_as`.
- How a Catalog finds a Series in Wikidata when Inventaire has nothing (title search with `P31` = manga series or comic series) is not tested.
- BnF 461 `$0` could identify an Edition Line for French books. Check it on Series with two French Edition Lines (One Piece standard and One Piece édition originale) before relying on it.

## 3. Barcode scanning

### Native `BarcodeDetector`

| Platform | Status | Source |
|---|---|---|
| iOS Safari 27.x, home-screen app | **Not available.** Since Safari 17 it exists only behind the "Shape Detection API" feature flag, off by default (`status: testable`). Safari 27.0–27.2 and Technology Preview 256 notes do not mention it. The home-screen app uses the same engine (inferred, not tested) | [MDN compat data](https://github.com/mdn/browser-compat-data/blob/main/api/BarcodeDetector.json), [WebKit preferences](https://github.com/WebKit/WebKit/blob/main/Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml), [Safari 27.2](https://webkit.org/blog/18515/webkit-features-for-safari-27-2/) |
| Android Chrome | Since Chrome 83. Formats include EAN-13, EAN-8, UPC-A, UPC-E. **Missing when Google Play services is absent or older than 19.7.42**, so always call `getSupportedFormats()` | [BarcodeDetectionProviderImpl.java](https://github.com/chromium/chromium/blob/main/services/shape_detection/android/java/src/org/chromium/shape_detection/BarcodeDetectionProviderImpl.java) |
| Desktop Chrome | macOS and ChromeOS only; not Windows or Linux | MDN compat data |
| Firefox | Not supported | MDN compat data |

### Camera on iOS

- WebKit supports `zoom`, `torch`, `focusDistance` and `whiteBalanceMode` constraints. **`focusMode` is not implemented** ([MediaTrackCapabilities.idl](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/mediastream/MediaTrackCapabilities.idl)). Use `zoom` (1.5–2×) for close-up barcodes, and `torch`.
- Camera permission is not remembered between sessions ([WebKit bug 280394](https://bugs.webkit.org/show_bug.cgi?id=280394), open).
- In a home-screen app, `getUserMedia()` can fail with `NotAllowedError` after `window.open()` ([bug 329593](https://bugs.webkit.org/show_bug.cgi?id=329593), open). Our sign-in uses a full-page redirect (spike 0001), not `window.open()`, so do not add `window.open()` to the scan flow.
- Other open bugs: [273938](https://bugs.webkit.org/show_bug.cgi?id=273938) (camera stream fails in a PWA on some devices), [324317](https://bugs.webkit.org/show_bug.cgi?id=324317) (portrait preview letterboxed on iOS 27).

### Fallback libraries

Sizes measured from the jsDelivr file lists; gzip measured with `CompressionStream`.

| Package | Version (date) | Licence | Size raw / gzip | EAN-5 add-on | Offline |
|---|---|---|---|---|---|
| **`barcode-detector`** | **3.2.3** (2026-10-19) | MIT | 58,154 / 16,874 B + zxing-wasm reader build | Through zxing-wasm | Yes, re-exports `prepareZXingModule` |
| `zxing-wasm` | 3.1.6 (2026-10-19) | MIT | `zxing_reader.wasm` **946,860 / 411,570 B**; JS 53,129 / 16,239 B; full build wasm 1,544,947 / 734,233 B | `eanAddOnSymbol`: `Ignore` (default), `Read`, `Require` | Yes, with `locateFile`; **by default it downloads the wasm from `fastly.jsdelivr.net`** |
| `@zxing/library` | 0.23.0 (2026-04-29) | Apache-2.0 | 362,150 / 108,484 B | Yes | Yes, pure JS |
| `@zxing/browser` | 0.2.1 (2026-07-06) | MIT | 441,121 / 111,868 B | Through @zxing/library | Yes |
| `@ericblade/quagga2` | 1.13.0 (2026-10-21) | MIT | 157,403 / 43,322 B | `supplements: ['ean_5_reader']` | Yes |
| `html5-qrcode` | 2.3.8 (**2023-04-15**, no release since) | Apache-2.0 | 375,364 / 108,480 B | Not documented | Yes |
| STRICH, Scandit, Dynamsoft | — | Proprietary | — | — | Excluded (AGPL) |

No decode-speed benchmark was found. Measure on a real iPhone in the scan ticket.

### Recommended approach

1. If `'BarcodeDetector' in globalThis` and `getSupportedFormats()` includes `ean_13`, use it. Else `await import('barcode-detector/ponyfill')`. Both have the same API, so there is one code path.
2. Before the first decode, call `prepareZXingModule({ overrides: { locateFile } })` so that the `.wasm` comes from our origin. Ship `zxing_reader.wasm` as our own asset; it can be checked against the exported `ZXING_WASM_SHA256`.
3. The service worker caches the wasm at install, so the first Shelf Check works offline.
4. First-scan download on the fallback: **about 445 KB gzip** (about 1.06 MB raw). Native Android and macOS Chrome download nothing.
5. Not quagga2: smaller, but a different API and no benchmark. Not html5-qrcode: no release since 2023.

### ISBN rules

Sources: [ISBN prefix 978 or 979](https://www.isbn-international.org/content/what-isbn/10#:~:text=currently%20this%20can%20only%20be%20either%20978%20or%20979), [ISMN 979-0](https://ismn-international.org/ismn/the-ismn/#:~:text=starting%20with%20979-0), [ISSN 977](https://www.issn.org/understanding-the-issn/issn-uses/identification-with-the-ean-13-barcode/#:~:text=977%20prefix%20assigned%20to%20serial%20publications), ISBN Users' Manual 7th edition (check digit: Appendix 1; 5-digit price add-on: §13.3).

Strip hyphens and spaces first. The key is the ISBN-13 as 13 digits.

| Input | Action |
|---|---|
| EAN-13 `978…`, valid check digit (weights 1, 3; mod 10) | Accept |
| EAN-13 `979[1-9]…`, valid check digit | Accept. Never derive an ISBN-10: 979-10 (France), 979-11 and 979-12 have no ISBN-10 |
| ISBN-10 typed by the reader (`X` allowed last) | Check (weights 10 to 2; mod 11), then `978` + first 9 digits + new EAN-13 check digit |
| `9790…` | Reject: "This is sheet music (ISMN), not a book." |
| `977…` | Reject: "This is a magazine (ISSN). Scan the book's ISBN." |
| Other EAN-13, UPC | Reject: "This is not a book barcode." |
| Bad check digit | Reject: "Misread. Try again." |
| EAN-5 add-on | Ignore (`eanAddOnSymbol: "Ignore"`) |

## 4. Reading Status in a Space

**Answer: the Space could list `community.lexicon.book.status`, but that lexicon does not exist.**

- **No namespace rule.** A space-type lexicon's `collections` is only an `nsid` array, "recommended record collections for clients" ([lexicon-document.ts#L667-L685](https://github.com/bluesky-social/atproto/blob/ae214a440e0113941f771e9fe0f6af92c1d03433/packages/lex/lex-document/src/lexicon-document.ts#L667-L685)). Even inside a permission set, collections "may live under a different authority" ([include-scope.ts#L138-L141](https://github.com/bluesky-social/atproto/blob/ae214a440e0113941f771e9fe0f6af92c1d03433/packages/oauth/oauth-scopes/src/scopes/include-scope.ts#L138-L141)).
- **How the scope becomes collections.** At token issue, `expandSpaceCollections` copies the space-type lexicon's `collections` into the token scope ([lexicon-manager.ts#L73-L100](https://github.com/bluesky-social/atproto/blob/ae214a440e0113941f771e9fe0f6af92c1d03433/packages/oauth/oauth-provider/src/lexicon/lexicon-manager.ts#L73-L100)). Writes check that the collection is in that list ([space-permission.ts#L142-L154](https://github.com/bluesky-social/atproto/blob/ae214a440e0113941f771e9fe0f6af92c1d03433/packages/oauth/oauth-scopes/src/scopes/space-permission.ts#L142-L154), [space/putRecord.ts#L52-L55](https://github.com/bluesky-social/atproto/blob/ae214a440e0113941f771e9fe0f6af92c1d03433/packages/pds/src/api/com/atproto/space/putRecord.ts#L52-L55)). Only the space-type lexicon itself is resolved.
- **No record validation against resolved lexicons.** The PDS validates only against its built-in schemas (`@TODO add support for lexicon resolution`); other records are stored as `unknown` ([repo/prepare.ts#L47-L69](https://github.com/bluesky-social/atproto/blob/ae214a440e0113941f771e9fe0f6af92c1d03433/packages/pds/src/repo/prepare.ts#L47-L69)). Our `put` already sends `validate: false`.
- **The lexicon does not exist.** The [lexicon.community repository](https://tangled.org/lexicon.community/lexicons/tree/main/community/lexicon) (source of truth; GitHub is a mirror) has `app`, `bookmarks`, `calendar`, `interaction`, `location`, `payments` and `preference`, but no `book`. Its only open pull request is about `service.describe`. DNS: `_lexicon.book.lexicon.community` and `_lexicon.lexicon.community` return NXDOMAIN (dns.google). GitHub code search finds the NSID only in Atomes' own docs.
- **What other apps use.** BookHive's [`buzz.bookhive.book`](https://github.com/nperez0111/bookhive/blob/6d889da359079318ab02a141d2b210b44aec2c1b/lexicons/book.json) (2026-07-23) puts the status in the book record: `status` known values `finished`, `reading`, `wantToRead`, `abandoned`; book referenced by `hiveId`, plus `identifiers` (`isbn13`, `isbn10`, `goodreadsId`, `hiveId`); `cover` blob; required `title`, `authors`, `hiveId`, `createdAt`. `bond.biblio.book` is a minimal record (`title`, `authors`, `lists`).

**This contradicted ADR 0004** ("Reading Status uses `community.lexicon.book.status`"). ADR 0004 is now amended with this fallback:

- Add **`app.atomes.readingStatus`** to the Space `collections`: Edition ISBN-13, optional Work identifier (section 2), `status` (`unread`, `reading`, `read`, `abandoned`), optional `finishedAt`.
- A Shared Reading Status is the same record type, written publicly (ADR 0003).
- Interoperability later: when a community book lexicon is published, write a mapped copy for Shared records. BookHive's status values map directly (`finished` = read); `unread` has no BookHive value.

Spike 0001 risk #3 is closed.

## 5. Blobs in a Space

**Answer: yes, and the blob stays private.**

- Upload uses `com.atproto.repo.uploadBlob`; there is no Space-specific upload ([space/getBlob.json#L7](https://github.com/bluesky-social/atproto/blob/ae214a440e0113941f771e9fe0f6af92c1d03433/lexicons/com/atproto/space/getBlob.json#L7)). It needs a blob permission ([repo/uploadBlob.ts#L12-L17](https://github.com/bluesky-social/atproto/blob/ae214a440e0113941f771e9fe0f6af92c1d03433/packages/pds/src/api/com/atproto/repo/uploadBlob.ts#L12-L17)). **Our scope has none: add `blob:image/*`.** A change of requested scope needs a new sign-in.
- A Space write links the blob in `space_record_blob` ([space/transactor.ts#L277-L282](https://github.com/bluesky-social/atproto/blob/ae214a440e0113941f771e9fe0f6af92c1d03433/packages/pds/src/actor-store/space/transactor.ts#L277-L282)). The owner reads it with `com.atproto.space.getBlob`, which serves only blobs linked in that Space ([space/getBlob.ts#L21-L29](https://github.com/bluesky-social/atproto/blob/ae214a440e0113941f771e9fe0f6af92c1d03433/packages/pds/src/api/com/atproto/space/getBlob.ts#L21-L29)).
- Public `com.atproto.sync.getBlob` serves only blobs linked by a public record ([sync/getBlob.ts#L23-L26](https://github.com/bluesky-social/atproto/blob/ae214a440e0113941f771e9fe0f6af92c1d03433/packages/pds/src/api/com/atproto/sync/getBlob.ts#L23-L26)). The earlier leak, [#5435](https://github.com/bluesky-social/atproto/issues/5435), was fixed in [`907f41a`](https://github.com/bluesky-social/atproto/commit/907f41a7b379a7e649a6c4842864946eef6eb757) (2026-09-15); the issue is still open.
- **Caution:** blobs are addressed by content hash. If a Shared (public) record links the same image, it becomes public.
- Limits: 5 MB per upload by default ([config.ts#L41](https://github.com/bluesky-social/atproto/blob/ae214a440e0113941f771e9fe0f6af92c1d03433/packages/pds/src/config/config.ts#L41)); 1 MiB per Space record ([space/src/types.ts#L29](https://github.com/bluesky-social/atproto/blob/ae214a440e0113941f771e9fe0f6af92c1d03433/packages/space/src/types.ts#L29)). Resize cover photos on the device before upload.

## 6. New collections and open sessions

**Answer: yes, at the next token refresh, without a new sign-in.**

- Collections are fixed in the stored token scope at issue ([token-manager.ts#L132-L133](https://github.com/bluesky-social/atproto/blob/ae214a440e0113941f771e9fe0f6af92c1d03433/packages/oauth/oauth-provider/src/token/token-manager.ts#L132-L133)); the request-time check does not resolve lexicons again ([space-permission.ts#L160-L164](https://github.com/bluesky-social/atproto/blob/ae214a440e0113941f771e9fe0f6af92c1d03433/packages/oauth/oauth-scopes/src/scopes/space-permission.ts#L160-L164)).
- On refresh, `rotateToken` builds the scope again from the original requested scope ([token-manager.ts#L260-L263](https://github.com/bluesky-social/atproto/blob/ae214a440e0113941f771e9fe0f6af92c1d03433/packages/oauth/oauth-provider/src/token/token-manager.ts#L260-L263)), so the new lexicon applies. The client accepts the new scope ([oauth-server-agent.ts#L145-L172](https://github.com/bluesky-social/atproto/blob/ae214a440e0113941f771e9fe0f6af92c1d03433/packages/oauth/oauth-client/src/oauth-server-agent.ts#L145-L172)).
- Resolved lexicons are cached for **5 minutes**, not 30 as reported in spike 0001 ([oauth-constants.ts#L84](https://github.com/bluesky-social/atproto/blob/ae214a440e0113941f771e9fe0f6af92c1d03433/packages/oauth/oauth-provider/src/oauth-constants.ts#L84)). If resolution fails, the old copy stays. Access tokens last up to 60 minutes. **Worst case: about 65 minutes** before an open session can write a new collection.
- Adding a collection widens access with no new consent screen. Removing one narrows access at the next refresh. Treat each change to `collections` as a deliberate decision.
- A scope can also list collections itself (`space:app.atomes.library?skey=self&collection=…`); that skips the lexicon expansion and loses the automatic update. Do not use it.

Pending change: PR [#5800](https://github.com/bluesky-social/atproto/pull/5800) (open, 2026-11-04) renames `uri` to `space` in `createSpace` and `getSpace` output and `NotSpaceOwner` to `NotAuthorized`. `src/lib/space/space.ts` matches only `SpaceAlreadyExists` and `SpaceNotFound`; check after the next Thursday release.

## Live tests for the owner

Sections 4 to 6 come from code, not from live calls: the spike had no sign-in to the alpha PDS. On `/dev/space`, signed in:

1. **Collection check (Q4, Q6).** In the Network tab, the `/oauth/token` response `scope` lists `collection=app.atomes.testItem`. Writing a record to a collection not in `library.json` fails with a missing-scope error. Add the collection, run `bun scripts/publish-lexicons.ts`, wait 5 minutes, then force a token refresh: the new `scope` lists both, and the write passes without a new sign-in.
2. **Blob privacy (Q5).** Add `blob:image/*` to the scope and sign in again. Upload a JPEG, put a test record that links it, then: `com.atproto.space.getBlob` returns 200; unauthenticated `com.atproto.sync.getBlob?did=…&cid=…` returns 400 `BlobNotFound`.

## Risks and open questions

| # | Item | Impact | Next step |
|---|---|---|---|
| 1 | No cover source for recent French manga; no cover licence stated anywhere | Blank covers for new Volumes | Placeholder spine cover; owner's photo; ask Inventaire and Open Library about cover terms |
| 2 | ADR 0004 named a lexicon that does not exist | Reading Status record type was undecided | Done: ADR 0004 amended to `app.atomes.readingStatus` |
| 3 | Edition Line grouping is ours to build | Wrong grouping, e.g. standard and perfect editions mixed | Use 010 `$b` / 215 `$d` format data; test on One Piece editions in the Catalog ticket |
| 4 | No published rate limits for BnF, SUDOC, Inventaire | Blocked by a source | 1 request/s per source, cache every answer |
| 5 | No decode-speed data for zxing-wasm on iPhone | Slow Quick Add | Measure in the scan ticket |
| 6 | Sections 4–6 not tested live | Code may differ from the hosted alpha PDS | Owner runs the live tests above |
| 7 | `atomes:` identifiers depend on the minting host | Unresolvable Series after a host disappears | `same_as` links; ADR 0010 |

## Method

- Book sources: one browser page per source origin, then same-origin `fetch()` calls for all 20 ISBNs. The browser sent its own User-Agent (it cannot be changed); Wikidata got `Api-User-Agent: Atomes-spike/0.1`. No email was sent. Raw responses were not kept.
- Package facts: npm registry JSON and jsDelivr file lists, read in the browser. Gzip sizes measured with `CompressionStream('gzip')`.
- Atproto code: read with the GitHub API at `ae214a4`.
