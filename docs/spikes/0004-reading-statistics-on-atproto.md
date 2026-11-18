# Spike: Reading statistics on the AT Protocol

Linear: CORE-143 (M11 · Statistics). Researched 2026-11-18, in three passes.

**How far the sources were checked.** Passes 1 and 2 could not open pages (the page-fetch tool was refused), so they used web search results only. Pass 3 opened 25 pages on 2026-11-18. Repo files were read on `main` on that date; no commit was pinned unless a hash is given. Each claim has a tag:

- **[page]**: this spike opened the page on 2026-11-18. The fetch tool gives a model's reading of the page with short quotes, not the raw text. So a quote can be trusted to be on the page, but a "the page does not say X" can be wrong.
- **[own]**: a search result shows text from the source's own page. The page was not opened.
- **[other]**: another project says it about the source. Use it as a lead, not as a fact.
- **[spike]**: another spike of this repo read it at the source. Spike 0005 (`docs/spikes/0005-charts-and-share-pictures.md`, same date) covers part of section C.

Sections B and E were not opened: they are [own] and [other] only. The list "Not verified" at the end names what stays open.

## TL;DR

Two book apps on the AT Protocol have reading statistics that ship: BookHive and its client Papertrail. Both compute from **public** records. No project was found that keeps the records private and shares only a total.

- **BookHive's stats page is small.** Four totals (books, pages, average rating, average length), then a "Year in Books" block when the reader finished **at least 3 books** in the year. Bars are plain `div`s, with no chart library. The only filter is the year, in the URL path [page].
- **BookHive's record has the dates and the rating.** `buzz.bookhive.book` has `startedAt`, `finishedAt`, `stars` (1–10), `bookProgress`, `previousReads` (at most 50) and `owned` [page].
- **BookHive shares with server-drawn pictures.** Five `/og/*` cards, drawn on the server with React and takumi, with no server cache. The profile card carries totals [page].
- **Papertrail's dashboard is cancelled.** Issues #50 (stats dashboard) and #52 (streaks) were closed as "not planned" on 2026-10-30. "Covered" story cards ship. The picture post to Bluesky (#54) is open and not built [page].
- **Compose link:** one parameter, `text` [spike 0005]. **Picture post:** `repo:app.bsky.feed.post` plus `blob:image/*`; a blob scope "can not be included in permission sets" [page].
- **Private data:** "Atproto spaces are moving from alpha to public beta on December 1" (post of 2026-11-13) [page].
- **Community book lexicon:** `community/lexicon/media/book` is now in the lexicon.community repository, with `defs`, `edition`, `review`, `searchEditions` and `resolveEditions` (added about 2026-11-17) [page]. Its fields were not read.

## Comparison

| Project | Lexicon | Reading fields | Statistics features | How computed | How shared |
|---|---|---|---|---|---|
| BookHive | `buzz.bookhive.book`, `buzz.bookhive.defs` (also `.buzz`, `.catalogBook` [own]) | `status` (`finished`, `reading`, `wantToRead`, `abandoned`), `startedAt`, `finishedAt`, `stars` 1–10, `bookProgress` (`percent`, `currentPage`, `totalPages`, chapters, `updatedAt`), `previousReads`, `owned` [page] | Reading Stats page per year; "Year in Books" from 3 finished books; all-time totals as fallback; XRPC query `getReadingStats` [page] | On the server, from a SQLite mirror filled from Jetstream [page] | Five `/og/*` pictures drawn on the server (React + takumi) [page] |
| Papertrail | Writes `buzz.bookhive.book` [page] | Same as BookHive | "Covered" story cards per year or month. Dashboard and streaks cancelled [page] | Static site plus two stateless functions; reads public data [page]. Where Covered is computed: not verified | Link with Open Graph tags; the image is the cover or avatar [page]. Picture post: open issue [page] |
| Popfeed | `social.popfeed.feed.review`, `.list`, `.listItem`; `social.popfeed.challenge.definition`, `.participation` [other] | `rating` 0–10 on the review; status from the list type [other]. Goal: `targetBooks`, `targetPages`, `currentBooks`, `currentPages` (inferred by Papertrail) [page] | "Set a yearly reading goal" [own]. No statistics page found | Not verified | Cross-post to Bluesky and Leaflet [own] |
| Skylights | `my.skylights.rel` (not confirmed) | Not verified | None found. The site sends readers to Popfeed [own] | Not verified | Not verified |
| biblio.bond | `bond.biblio.book`, `.list`, `.stamp` [own] | `title`, `authors`, `lists` [spike] | None found | Indexes records from the firehose [own] | Not verified |
| ShelfCheck | `org.shelfcheck.shelf.entry`, `.defs`, `.author.follow`, `.book.dismissed` [page] | Status (`wantToRead`, `reading`, `finished`, `abandoned`), "dates, rating, notes" [page] | None in the README [page] | Copies the reading list to the reader's PDS [page] | Not verified |
| teal.fm | `fm.teal.alpha.feed.play`, then `fm.teal.feed.play`; queries `fm.teal.stats.*` [own] | One record per play | Top albums chart with a period and a grid (draft) [own] | AppView queries; other clients count on the device with `listRecords` [own] | The chart keeps its choices "in the shareable URL" [own] |
| Rocksky | `app.rocksky.*` [own] | One record per scrobble | Stats, scrobbles chart, top lists "over any period", "Wrapped" [own] | Public AppView; writes go to the PDS [own] | Public profile page. No share picture found |

## A. Book and media trackers

**Answer: BookHive and Papertrail have statistics that ship. Popfeed has a goal only. The others have none that a source shows.**

### BookHive

Repo [nperez0111/bookhive](https://github.com/nperez0111/bookhive), read on `main` (631 commits).

- ["All data is stored in your PDS, and can be used by other apps"](https://github.com/nperez0111/bookhive#:~:text=All%20data%20is%20stored%20in%20your%20PDS%2C%20and%20can%20be%20used%20by%20other%20apps). ["Backend: Hono with AT Proto for OAuth"](https://github.com/nperez0111/bookhive#:~:text=Backend%3A%20Hono%20with%20AT%20Proto%20for%20OAuth) [page]. The README does not mention statistics, goals or social cards [page].

**The record** ([`lexicons/book.json`](https://raw.githubusercontent.com/nperez0111/bookhive/main/lexicons/book.json), [`lexicons/defs.json`](https://raw.githubusercontent.com/nperez0111/bookhive/main/lexicons/defs.json)) [page]:

| Field | Type | Note |
|---|---|---|
| key | `tid` | One record per book, many per reader |
| `title`, `authors`, `hiveId`, `createdAt` | required | `authors` is one string, 1–2,048 characters, tab-separated |
| `status` | string, known values | `buzz.bookhive.defs#finished`, `#reading`, `#wantToRead`, `#abandoned` |
| `startedAt` | datetime | ["The date the user started reading the book"](https://raw.githubusercontent.com/nperez0111/bookhive/main/lexicons/book.json#:~:text=The%20date%20the%20user%20started%20reading%20the%20book) |
| `finishedAt` | datetime | "The date the user finished reading the book" |
| `stars` | integer 1–10 | ["Number of stars given to the book (1-10) which will be mapped to 1-5 stars"](https://raw.githubusercontent.com/nperez0111/bookhive/main/lexicons/book.json#:~:text=Number%20of%20stars%20given%20to%20the%20book%20%281%2D10%29%20which%20will%20be%20mapped%20to%201%2D5%20stars) |
| `review` | string | At most 15,000 graphemes |
| `bookProgress` | ref `buzz.bookhive.defs#bookProgress` | Required `updatedAt`; optional `percent` (0–100), `totalPages`, `currentPage`, `totalChapters`, `currentChapter` |
| `previousReads` | array of `buzz.bookhive.defs#previousRead`, at most 50 | ["History of prior reads of this book by the user (most recent first)"](https://raw.githubusercontent.com/nperez0111/bookhive/main/lexicons/book.json#:~:text=History%20of%20prior%20reads%20of%20this%20book%20by%20the%20user%20%28most%20recent%20first%29). Each item: required `finishedAt`, optional `startedAt` |
| `owned` | boolean | ["Whether the user owns this book"](https://raw.githubusercontent.com/nperez0111/bookhive/main/lexicons/book.json#:~:text=Whether%20the%20user%20owns%20this%20book) |
| `identifiers` | ref `#bookIdentifiers` | `hiveId`, `isbn10`, `isbn13`, `goodreadsId`, all optional |
| `cover` | blob | At most 1,000,000 bytes |
| `hiveBookUri` | string | |

- So `owned` is a public yes or no on the book record. There is no copy record, no format and no purchase date.
- `bookProgress` keeps one `updatedAt`, not a history. Papertrail says the same: BookHive ["keeps only the latest bookProgress.updatedAt, not a history."](https://github.com/renderghost/at-papertrail/issues/52#:~:text=keeps%20only%20the%20latest%20bookProgress.updatedAt%2C%20not%20a%20history.) [page].

**The stats page** ([`src/pages/readingStats.tsx`](https://github.com/nperez0111/bookhive/blob/main/src/pages/readingStats.tsx), [`src/data/readingStats.ts`](https://github.com/nperez0111/bookhive/blob/main/src/data/readingStats.ts)) [page]:

- URL: `/profile/<actor>/stats` for this year, `/profile/<actor>/stats/<year>` for another year. The year is a path segment. There is no other filter: no genre, no format, no all-time link.
- Always shown, four totals: "Books in {year}" (or "Books read"), "Pages read", "Avg rating" (one decimal), "Avg length (pgs)". A missing value shows "—".
- "Year in Books", only when the reader finished at least 3 books in the year (`MIN_BOOKS_FOR_YEAR_STATS = 3`):
  - "Bookends of the year": first and last book finished, with dates.
  - "Rating distribution": one bar per star, 1 to 5.
  - "Top genres": bars, up to 15 genres.
  - "Book length": shortest and longest read.
  - "Popularity": most and least popular book, by community rating.
- Under the threshold the page says ["Finish at least 3 books in {year} to see your Year in Books."](https://github.com/nperez0111/bookhive/blob/main/src/pages/readingStats.tsx#:~:text=Finish%20at%20least%203%20books%20in) and gives the all-time count.
- Empty states name the missing data: "Add page counts to your books to see shortest and longest."
- Drawing: no chart library and no SVG. A bar is a `div` with a width in percent.
- No share button and no `og:image` in the page file.
- Pages come from the reader's `bookProgress.totalPages` first, then from the catalogue (`numPages`). Genres come from the catalogue table `hive_book_genre`.
- Two things the fetch tool read in the code, not checked by running it:
  - `getReadingStatsForYear` cuts the year with `getFullYear()`, which is local time. `core/readingYear.ts` is described as ["UTC boundaries, re-reads count"](https://github.com/nperez0111/bookhive/blob/main/ARCHITECTURE.md#:~:text=UTC%20boundaries%2C%20re%2Dreads%20count).
  - `readingStats.ts` does not read `previousReads`. The profile card does (below). So the page and the card can show different counts.
  - The genre bar divides by the sum of the top-genre counts, so a book with several genres counts more than once.

**How it is computed** ([`ARCHITECTURE.md`](https://github.com/nperez0111/bookhive/blob/main/ARCHITECTURE.md), [`AGENTS.md`](https://github.com/nperez0111/bookhive/blob/main/AGENTS.md)) [page]:

- On the server. `src/bsky/jetstream.ts` follows Jetstream v2; `src/bsky/ingester.ts` is a "Book/buzz/list/item mirror". ["there is no periodic PDS scan"](https://github.com/nperez0111/bookhive/blob/main/AGENTS.md#:~:text=there%20is%20no%20periodic%20PDS%20scan).
- "No SQL lives in `src/pages/`": the numbers come from `src/data/readingStats.ts`, over the mirrored `user_book` rows.
- There is an XRPC query `getReadingStats`.
- A stale mirror is a reported bug: a change "appear[s] in Jetstream" but BookHive still shows "its older mirrored data" ([issue #242](https://github.com/nperez0111/bookhive/issues/242)) [own].

**Reading goals**: the home page says a reader can "set reading goals" [own]. The README and `ARCHITECTURE.md` name no goal feature and no goal file [page]. Not verified.

### Papertrail

Repo [renderghost/at-papertrail](https://github.com/renderghost/at-papertrail), read on `main` (65 commits).

- "A social reading client for BookHive, built on the AT Protocol." ["Papertrail is a front end with no database: a static site plus two small, stateless functions."](https://github.com/renderghost/at-papertrail#:~:text=Papertrail%20is%20a%20front%20end%20with%20no%20database%3A%20a%20static%20site%20plus%20two%20small%2C%20stateless%20functions) [page]. **Corrected:** the first version of this spike called it browser-only.
- ["Everything Papertrail reads is public."](https://github.com/renderghost/at-papertrail#:~:text=Everything%20Papertrail%20reads%20is%20public) "every write goes straight from your browser to your own PDS" [page].
- Scope at the first release ([PR #6](https://github.com/renderghost/at-papertrail/pull/6), merged 2026-10-25): ["scope is atproto repo:buzz.bookhive.book, so it can write BookHive book records and nothing else"](https://github.com/renderghost/at-papertrail/pull/6#:~:text=scope%20is%20atproto%20repo%3Abuzz.bookhive.book%2C%20so%20it%20can%20write%20BookHive%20book%20records%20and%20nothing%20else) [page]. The README now says "OAuth scopes name exactly the collections above (`src/lib/oauthConfig.ts`)", so the scope has more than one collection today [page]. The exact string was not read.
- **Covered** ships: ["Wrapped-style story cards for any year or month"](https://github.com/renderghost/at-papertrail#:~:text=Wrapped%2Dstyle%20story%20cards%20for%20any%20year%20or%20month): "books and pages, month-by-month chart, top genres, [longest and shortest, fastest read, highest rated, most-read author, bookends](https://github.com/renderghost/at-papertrail#:~:text=longest%20and%20shortest%2C%20fastest%20read%2C%20highest%20rated%2C%20most%2Dread%20author%2C%20bookends)" [page].
- **Stats dashboard**, [issue #50](https://github.com/renderghost/at-papertrail/issues/50): opened 2026-10-29, **closed as not planned on 2026-10-30**, no pull request [page]. **Corrected:** the first version called it planned. Its design is still a useful list:
  - Scope: ["Any year, or all time."](https://github.com/renderghost/at-papertrail/issues/50#:~:text=Any%20year%2C%20or%20all%20time)
  - ["a calendar heatmap of finish days, and books per month"](https://github.com/renderghost/at-papertrail/issues/50#:~:text=a%20calendar%20heatmap%20of%20finish%20days%2C%20and%20books%20per%20month)
  - "top genres, top authors, new-to-you authors versus returning ones"
  - "your rating spread, your average versus the catalogue average"
  - "length distribution", "publication decades", "formats (owned, ebook, audio, once tracked)", "re-reads", "abandoned books, with where you stopped"
  - "days to finish per book, and pages per day while reading"
  - "each has a text or table equivalent"
  - Data: "your records plus catalogue numPages and genres". Years in UTC, "so the numbers match its Year in Books". ["Re-reads: counted from"](https://github.com/renderghost/at-papertrail/issues/50#:~:text=Re%2Dreads%3A%20counted%20from) `previousReads`.
- **Streaks**, [issue #52](https://github.com/renderghost/at-papertrail/issues/52): also closed as not planned on 2026-10-30 [page]. A streak is ["Days in a row with reading logged."](https://github.com/renderghost/at-papertrail/issues/52#:~:text=Days%20in%20a%20row%20with%20reading%20logged.) The honest first version would count ["Days you finished or updated a book"](https://github.com/renderghost/at-papertrail/issues/52#:~:text=Days%20you%20finished%20or%20updated%20a%20book). Exact streaks need reading sessions, which need a new lexicon.
- **Covered v2**, [issue #54](https://github.com/renderghost/at-papertrail/issues/54): open, no pull request [page]. ["your 2026 so far"](https://github.com/renderghost/at-papertrail/issues/54#:~:text=your%202026%20so%20far); ["a short Covered for each month, ready on the 1st"](https://github.com/renderghost/at-papertrail/issues/54#:~:text=a%20short%20Covered%20for%20each%20month%2C%20ready%20on%20the%201st); ["the full year unlocks in late December"](https://github.com/renderghost/at-papertrail/issues/54#:~:text=the%20full%20year%20unlocks%20in%20late%20December); group cards with ["the most-loved and most-divisive books"](https://github.com/renderghost/at-papertrail/issues/54#:~:text=the%20most%2Dloved%20and%20most%2Ddivisive%20books).
- **Goals**, [issue #2](https://github.com/renderghost/at-papertrail/issues/2): open since 2026-10-24 [page]. It reuses Popfeed's challenge records (below).

### Popfeed

- Site [popfeed.social](https://popfeed.social). Features in the [Google Play listing](https://play.google.com/store/apps/details?id=app.popsky&hl=en_US): log movies, shows, books, games and music; reviews and ratings; lists and rankings; "Set a yearly reading goal"; import from Letterboxd, Goodreads and StoryGraph; cross-post to Bluesky and Leaflet [own].
- ["PopFeed doesn't publish schemas"](https://github.com/renderghost/at-papertrail/issues/2#:~:text=publish%20schemas), so Papertrail inferred the goal records from live records [page]:
  - `social.popfeed.challenge.definition` with `readingGoal: { startsAt, endsAt, targetBooks, targetPages, createdAt, updatedAt }`.
  - `social.popfeed.challenge.participation` with `currentBooks`, `currentPages` and a `status` (`not_started`, `in_progress`, others not confirmed).
  - "About 90 repos have joined PopFeed's own" "2026 Reading Goal".
- So the participation record is a small public **total** on the PDS: the nearest thing to a "summary record" found.
- Other records, from other projects [other]: `social.popfeed.feed.listItem`, `.review`, `.list` ([opnshelf PR #654](https://github.com/Rowan-Paul/opnshelf/pull/654)); review rating 0–10 and status from the list type ([skybridge README](https://github.com/neodb-social/skybridge)); a `currently_reading_books` list ([KOReader plugin](https://tangled.org/graham.systems/paperbnd.koplugin)).
- No statistics page and no year in review were found in any source.

### Others

- **ShelfCheck** ([nowells/libby-reading-list](https://github.com/nowells/libby-reading-list)) [page]: four lexicons, in `public/lexicons/`. The entry is ["a book on your shelf with status"](https://github.com/nowells/libby-reading-list#:~:text=a%20book%20on%20your%20shelf%20with%20status) (`wantToRead | reading | finished | abandoned`), "dates, rating, notes". ["ShelfCheck mirrors your reading list to your PDS so it follows you across devices"](https://github.com/nowells/libby-reading-list#:~:text=ShelfCheck%20mirrors%20your%20reading%20list%20to%20your%20PDS%20so%20it%20follows%20you%20across%20devices). It reads `buzz.bookhive.book` records with status `wantToRead`. No statistics in the README.
- **Skylights** ([skylights.my](https://skylights.my/)): the site offers to move lists, ratings and reviews to Popfeed [own]. The lexicon folder URL listed by [awesome-lexicons](https://github.com/lexicon-community/awesome-lexicons) (`Gregoor/skylights/tree/main/web/lexicons`) returned **404** on 2026-11-18 [page].
- **biblio.bond** ([site](https://biblio.bond/), [developer guide](https://biblio.bond/dev-guide)): `bond.biblio.book`, `.list` (challenges), `.stamp`. It indexes its own records and `buzz.bookhive.book` from the firehose [own].
- **Paperbnd**: uses Popfeed's lexicons ([newsletter](https://leaflet.connectedplaces.online/3lxx2rk4pv22r)) [other].
- **skybridge** ([neodb-social/skybridge](https://github.com/neodb-social/skybridge)): a bridge from Popfeed and BookHive records to the Fediverse. Useful as a field map [own].

### Community book lexicon

- **New since spike 0002.** The lexicon.community repository on Tangled now has a [`media` folder](https://tangled.org/lexicon.community/lexicons/tree/main/community/lexicon) (with `app`, `bookmarks`, `calendar`, `interaction`, `location`, `payments`, `preference`). [`community/lexicon/media/book`](https://tangled.org/lexicon.community/lexicons/tree/main/community/lexicon/media/book) holds `defs.json` (481 lines), `edition.json`, `resolveEditions.json`, `review.json` (64 lines) and `searchEditions.json`. Commit `c4b47a4b`, "Add shared book edition, review, and discovery lexicons", shown as "1d ago" on 2026-11-18 [page].
- The file contents were not read: the Tangled file pages gave the fetch tool no JSON. So whether `defs.json` has a reading status is **not verified**. No file name is a status or shelf record.
- [MarshalX/atproto-lexicons PR #3](https://github.com/MarshalX/atproto-lexicons/pull/3), merged 2026-11-17, added the same five NSIDs to a lexicon package [page].
- [BookHive PR #229](https://github.com/nperez0111/bookhive/pull/229) proposed them under `community.lexicon.book.*`; a review requires only `subject` and `createdAt` [own]. The published namespace is `community.lexicon.media.book.*`.
- `community.lexicon.book.status` does not exist [spike 0002, section 4].
- Forum group "WG Books": ["In Which A Book Lexicon is Born"](https://discourse.atmosphere.community/t/in-which-a-book-lexicon-is-born/1042), ["Handling Reviews for the Book Lexicon"](https://discourse.atmosphere.community/t/handling-reviews-for-the-book-lexicon/1085), ["On Defining Cross-App Records and the Book Record"](https://discourse.atmosphere.community/t/on-defining-cross-app-records-and-the-book-record/1144). The first scope is read status and reviews, with no visibility model [own].

## B. Statistics and "wrapped" in other domains

**Answer: music apps have the fullest statistics. They use an AppView; clients that do not trust it count on the device.** No page of this section was opened.

- **teal.fm**
  - The play record `fm.teal.alpha.feed.play` says "This lexicon is in a not officially released state" ([lexicon file](https://github.com/teal-fm/teal/blob/25d6d8d1d9a2bb2735c74fb4bab5d35f808d120e/lexicons/fm.teal.alpha/feed/play.json)) [own]. A newer `fm.teal.feed.play` is on [Lexicon Garden](https://lexicon.garden/lexicon/did:plc:iwhuynr6mm6xxuh25o4do2tx/fm.teal.feed.play/docs) [own].
  - [teal PR #231](https://github.com/teal-fm/teal/pull/231) (draft) adds "a profile-linked top albums chart ranked by indexed listens". The viewer picks a period and a 3×3, 4×4 or 5×5 grid, at most 25 albums. It calls `getUserTopReleases` and `getProfile` [own].
  - Sharing: the PR keeps "those choices in the shareable URL" [own].
  - [Fathom](https://github.com/ewanc26/fathom), another client: a public host "404'd every fm.teal.stats.* route", so it reads plays from each PDS with `com.atproto.repo.listRecords`, 100 records at a time, and counts on the device. It shows top artists and releases for 7 days, 30 days or all time [own].
  - [Tourmaline](https://docs.ewancroft.uk/projects/tourmaline) also reads plays from the PDS and counts top artists itself [own].
- **Rocksky**
  - "The SDKs read from the public AppView and write app.rocksky.* records straight to the user's PDS" ([SDK overview](https://docs.rocksky.app/sdks/overview)) [own].
  - Queries: `app.rocksky.stats.getStats`, [`app.rocksky.charts.getScrobblesChart`](https://docs.rocksky.app/api-reference/approckskycharts/get-the-scrobbles-chart), `getTopArtists`, global stats, `getWrapped` ([TypeScript SDK](https://docs.rocksky.app/sdks/typescript)) [own].
  - The [README](https://github.com/tsirysndr/rocksky) lists top artists, tracks and albums "over any period" and "Wrapped", "your listening year, summarised" [own].
- **Bluesky year in review**
  - [flo-bit/bluesky-wrapped](https://github.com/flo-bit/bluesky-wrapped): a "statically rendered page (deployed to github pages)", work in progress. Its goals: share results on Bluesky, "part of it as an image", with no sign-in if possible [own].
  - [Bluesky Wrap 2025](https://theblue.social/tools/bluesky-wrap-2025): top posts, hashtags and an "archetype" [own].
- **Heatmaps**
  - [aliceisjustplaying/bluesky-heatmap](https://github.com/aliceisjustplaying/bluesky-heatmap): "a per-day post count heatmap for you or another user", listed in the [Bluesky showcase](https://docs.bsky.app/showcase/) [own]. A second search did not find the repo again.
  - Tangled profiles show a "PUNCHCARD" with a commit count [own].
- **Leaflet, WhiteWind, Smoke Signal**: no statistics feature found.

## C. How statistics are shared

**Answer: a link that shows a card is what ships, in two forms: a picture drawn by the server (BookHive) and tags that reuse the cover or avatar (Papertrail). A post with a picture is not built in any book app.**

### 1. A link, shown as a card

- **BookHive draws pictures on the server** [page]:
  - Route `/og/*`, file `src/routes/og.tsx`: ["OG images, no server cache"](https://github.com/nperez0111/bookhive/blob/main/AGENTS.md#:~:text=OG%20images%2C%20no%20server%20cache).
  - A worker, `og-render-worker` (`src/workers/og-render/`): ["OG image generation (React+takumi)"](https://github.com/nperez0111/bookhive/blob/main/AGENTS.md#:~:text=OG%20image%20generation%20%28React%2Btakumi%29), with the package `@takumi-rs/image-response`.
  - [`src/data/socialCards.ts`](https://github.com/nperez0111/bookhive/blob/main/src/data/socialCards.ts) holds "The aggregates behind the OG cards": functions for the book, profile, author and genre cards. It draws nothing itself.
  - The **profile card** carries totals: all books, books finished this year (re-reads count), the current book, up to 10 covers and the top 5 genres.
  - The card size, and which page sets `og:image` to which card: not verified (`og.tsx` was not read). [`ARCHITECTURE.md`](https://github.com/nperez0111/bookhive/blob/main/ARCHITECTURE.md#:~:text=the%20five) says there are five cards; four were seen.
- **Papertrail sends tags only** ([PR #89](https://github.com/renderghost/at-papertrail/pull/89), merged 2026-10-29) [page]:
  - ["vercel.json sends link-preview crawlers (by user-agent) to api/share.ts"](https://github.com/renderghost/at-papertrail/pull/89#:~:text=vercel.json%20sends%20link%2Dpreview%20crawlers%20%28by%20user%2Dagent%29%20to%20api%2Fshare.ts).
  - ["It answers with escaped Open Graph and Twitter tags plus a canonical link"](https://github.com/renderghost/at-papertrail/pull/89#:~:text=It%20answers%20with%20escaped%20Open%20Graph%20and%20Twitter%20tags%20plus%20a%20canonical%20link).
  - ["The image is the cover or avatar itself, so nothing is rendered."](https://github.com/renderghost/at-papertrail/pull/89#:~:text=The%20image%20is%20the%20cover%20or%20avatar%20itself%2C%20so%20nothing%20is%20rendered.) ["People get the app on the same URL."](https://github.com/renderghost/at-papertrail/pull/89#:~:text=People%20get%20the%20app%20on%20the%20same%20URL.)
  - Drawn cards are a follow-up, issue #87 "Rendered share-card images, and shareable Covered cards".
  - The README: "Book, profile, list and author links unfold into proper cards on Bluesky, Slack, Discord and the like." Covered is not in that list.
- **How Bluesky makes the card.** ["each client fetches and embeds this card metadata"](https://bsky.network/docs/about-bluesky-content/posts#:~:text=each%20client%20fetches%20and%20embeds%20this%20card%20metadata) [spike 0005]. The card is an `app.bsky.embed.external` with a `thumb` blob, `image/*`, at most 1,000,000 bytes ([`external.json` L23–L27](https://github.com/bluesky-social/bsky/blob/cb6d2ce863352e26acdf35e660e365225e7edbae/lexicons/app/bsky/embed/external.json#L23-L27)) [spike 0005].
- So the card is fixed when the post is written. This follows from the guide; it was not tested.
- The Bluesky app asks its own service for the card data, `https://cardyb.bsky.app/v1/extract?url=` ([third-party reading](https://github.com/GroveResearch/at_mcp/pull/230), [social-app issue #6538](https://github.com/bluesky-social/social-app/issues/6538)) [other].
- teal.fm: the chart state is in the URL (section B) [own].

### 2. A compose link

- Action Intent Links, read at the source by spike 0005 (the doc moved from `docs.bsky.app` to `bsky.network/docs`) [spike 0005]:
  - ["The web URL endpoint is https://bsky.app/intent/compose, with the HTTP query parameter text"](https://bsky.network/docs/intent-links#:~:text=The%20web%20URL%20endpoint%20is%20https%3A%2F%2Fbsky.app%2Fintent%2Fcompose%2C%20with%20the%20HTTP%20query%20parameter%20text). The app link is `bluesky://intent/compose` with the same parameter.
  - ["Currently only the compose action URL endpoint is implemented."](https://bsky.network/docs/intent-links#:~:text=Currently%20only%20the%20compose%20action%20URL%20endpoint%20is%20implemented)
  - ["Following the link does not automatically result in the action"](https://bsky.network/docs/intent-links#:~:text=Following%20the%20link%20does%20not%20automatically%20result%20in%20the%20action).
- The doc has no parameter other than `text`. So the link cannot attach a picture.
- Papertrail's book club: "One tap opens a Bluesky post to start the conversation." [page]. How it opens the post was not read.
- Reports in the app's issue tracker [own]: a URL in the text gives no link card ([#5738](https://github.com/bluesky-social/social-app/issues/5738)); line breaks differ between systems ([#6133](https://github.com/bluesky-social/social-app/issues/6133)); some characters come out as HTML entities ([#9623](https://github.com/bluesky-social/social-app/issues/9623)).

### 3. A post with a picture, written through OAuth

- Record: `app.bsky.feed.post` with `app.bsky.embed.images`. Up to 4 pictures, each a blob `image/*` of at most **2,000,000 bytes** ("May be up to 2 MB, formerly limited to 1 MB"). `alt` is required ([`images.json` L8–L34](https://github.com/bluesky-social/bsky/blob/cb6d2ce863352e26acdf35e660e365225e7edbae/lexicons/app/bsky/embed/images.json#L8-L34)) [spike 0005]. **Corrected:** the first version said 1,000,000 bytes, from older guides.
- Scopes, from the [permission spec](https://atproto.com/specs/permission) [page]:
  - `repo`: `collection` is the "NSID of record types"; `action` "defines the set of record operations allowed". ["If not defined, all operations are allowed"](https://atproto.com/specs/permission#:~:text=If%20not%20defined%2C%20all%20operations%20are%20allowed).
  - `blob`: "Ability to upload media files (blobs) to PDS." `accept` takes ["MIME types or partial MIME type glob patterns"](https://atproto.com/specs/permission#:~:text=MIME%20types%20or%20partial%20MIME%20type%20glob%20patterns). Example: `blob?accept=video/*&accept=text/html`.
  - ["Permissions of this type can not be included in permission sets"](https://atproto.com/specs/permission#:~:text=Permissions%20of%20this%20type%20can%20not%20be%20included%20in%20permission%20sets), "and must be requested directly by client apps." The spec says this for `blob`, `account` and `identity`.
  - `include` "is used to reference a permission set". ["Permission sets are limited to expressing permissions that reference resources under the same NSID namespace"](https://atproto.com/specs/permission#:~:text=Permission%20sets%20are%20limited%20to%20expressing%20permissions%20that%20reference%20resources%20under%20the%20same%20NSID%20namespace). So an app's own set cannot grant `app.bsky.feed.post`.
  - "if a permission set can not be resolved" "and is not already in a local cache" ["the auth request will fail"](https://atproto.com/specs/permission#:~:text=the%20auth%20request%20will%20fail).
- `transition:generic` is "still supported, but granular permissions are encouraged" ([OAuth spec](https://atproto.com/specs/oauth)) [own]. Permission sets are "the recommended approach since their introduction in late 2025" ([Scope Builder](https://atproto.com/guides/scope-builder)) [own].
- `bsky.social` accepted `repo:app.bsky.feed.post?action=create blob:image/*` in a live PAR request [spike 0005].
- A session keeps the scopes of its sign-in, so a new scope needs a new sign-in [spike 0003, section 3].
- State in the book apps [page]:
  - Papertrail, issue #54, open: ["every card exports as an image, rendered by the share-card function"](https://github.com/renderghost/at-papertrail/issues/54#:~:text=every%20card%20exports%20as%20an%20image%2C%20rendered%20by%20the%20share%2Dcard%20function) "or a browser canvas", and ["one tap posts it to Bluesky, with alt text"](https://github.com/renderghost/at-papertrail/issues/54#:~:text=one%20tap%20posts%20it%20to%20Bluesky%2C%20with%20alt%20text). No code, no scope named.
  - BookHive: no picture post found in the files read.
- Seen elsewhere: [skyreader PR #497](https://github.com/disnet/skyreader/pull/497) posts up to four pictures with alt text, with `repo:app.bsky.feed.post blob:image/*` asked at first use ([PR #484](https://github.com/disnet/skyreader/pull/484)) [own].

### 4. A public profile page

- BookHive's stats page lives under `/profile/<actor>/stats` and takes an `isOwnProfile` flag [page]. So it is built to be seen by others. Whether a signed-out visitor can open it was not tested.
- Rocksky and teal.fm show charts on a public profile [own].

## D. Privacy patterns

**Answer: no project keeps the records private and shares only a total. No "stats" or "year summary" record type was found.**

- Every tracker in section A writes public records. BookHive's numbers come from a mirror of public records; Papertrail says "Everything Papertrail reads is public." [page].
- `owned` is public in BookHive: a boolean on the public book record [page].
- Nearest thing to a total on the PDS: Popfeed's `social.popfeed.challenge.participation` (`currentBooks`, `currentPages`), which Papertrail plans to update so that "PopFeed shows the same numbers" [page]. It is public, and its shape is inferred.
- Private data on the app server: BookHive keeps uploaded ebook files there. "Your files stay private. Nothing is published to your PDS" ([home page](https://bookhive.buzz/)) [own]. This is about files, not reading history.
- Private data on atproto, by date:
  - 2026-03-24: the [Spring 2026 roadmap](https://atproto.com/blog/2026-spring-roadmap) names "permissioned data" [own].
  - 2026-08-20: the [Spaces alpha](https://atproto.com/blog/atproto-spaces-alpha) starts [own]. See spike 0001, sections 4 and 5.
  - 2026-11-13: ["Getting Ready for the Spaces Public Beta"](https://atproto.com/blog/getting-ready-for-the-spaces-public-beta) [page]:
    - ["Atproto spaces are moving from alpha to public beta on December 1."](https://atproto.com/blog/getting-ready-for-the-spaces-public-beta#:~:text=Atproto%20spaces%20are%20moving%20from%20alpha%20to%20public%20beta%20on%20December%201)
    - ["The public beta is meant for developers to build production apps with real users."](https://atproto.com/blog/getting-ready-for-the-spaces-public-beta#:~:text=The%20public%20beta%20is%20meant%20for%20developers%20to%20build%20production%20apps%20with%20real%20users.)
    - Reference PDS operators "update to the latest version released on December 1". Active `did:plc` accounts get a new `kem` key.
    - New documentation "with sample code" and "an SDK for working with Spaces" are announced.
    - Named providers: "Blacksky, Eurosky, Northsky, and selfhosted.social".
    - ["Please do not deploy the alpha in production or with production data."](https://atproto.com/blog/getting-ready-for-the-spaces-public-beta#:~:text=Please%20do%20not%20deploy%20the%20alpha%20in%20production%20or%20with%20production%20data.) ["The hosted Spaces alpha PDS will be shut down at some point in the future."](https://atproto.com/blog/getting-ready-for-the-spaces-public-beta#:~:text=The%20hosted%20Spaces%20alpha%20PDS%20will%20be%20shut%20down%20at%20some%20point%20in%20the%20future.)
  - The post does not say whether Spaces data is encrypted. Proposal 0016 says "access control, not confidentiality" [spike 0001, risk 2].
- Forum thread ["Analytics over ATProto"](https://discourse.atmosphere.community/t/analytics-over-atproto/933) (2026-07-06): about numbers for authors, not personal statistics. One comment: "we aggregate at the source and threshold small counts to prevent deanonymization" [own].

## E. Outside the AT Protocol

No page of this section was opened. All claims are [own], from search excerpts of the products' pages.

**StoryGraph.** Public stats pages show a line chart of books and pages, a moods chart, pie charts for pace and page length, the fiction and nonfiction split, genres, format, most-read authors and a bar chart of star ratings. Monthly views have pages per day. The paid plan adds custom pie and bar charts, a comparison of two periods or two slices, a custom period filter, and ratings by mood and genre ([Stats V4](https://roadmap.thestorygraph.com/features/posts/stats-v4), [Stats V3](https://roadmap.thestorygraph.com/features/posts/stats-v3), [request page](https://roadmap.thestorygraph.com/requests-ideas/posts/new-updated-stats-charts)). These roadmap pages are from 2021 and 2022.

**Goodreads "Year in Books".** One page per reader and year: books read, pages read, shortest and longest book, average length, average rating, most and least shelved book, and the highest rated book on Goodreads. The 2017 post adds top genres ([Goodreads blog](https://www.goodreads.com/blog/show/1114-2017---see-your-year-in-books)). Readers in the comments say page counts come from the default edition, and audiobooks skew them. BookHive's "Year in Books" has almost the same list (section A).

**Bookly.** It tracks "total read time, pages read, reading speed, estimated book finish time, daily reading time, days you read in a row" ([App Store](https://apps.apple.com/us/app/bookly-track-books-stats/id1085047737)). It makes a picture for each finished book. Weekly, monthly and yearly reports are paid features ([Bookly blog](https://blog.getbookly.com/how-to-generate-a-reading-report-with-bookly/)). The pictures can be shared. All of it needs timed reading sessions.

**Hardcover.** Public stats pages (`hardcover.app/@<user>/stats`) show books read, pages read, hours listened, authors read, rates per year, month and day, top genres and moods with a "Missing data from N books" note, fiction against non-fiction, physical against ebook against audiobook, page-count groups, and a heatmap of average rating by genre and mood. Re-reads count in the book total. Yearly pages exist ([2024](https://hardcover.app/2024), [2023](https://hardcover.app/2023)).

| Dimension | StoryGraph | Goodreads | Bookly | Hardcover | BookHive [page] | Papertrail Covered [page] |
|---|---|---|---|---|---|---|
| Books and pages | Line chart | Totals | Yes | Yes | Totals | Totals, chart by month |
| Genres | Yes | Yes (2017) | Not seen | Yes | Top genres, bars | Top genres |
| Authors | Yes | Not seen | Not seen | Count | Not on the page | Most-read author |
| Ratings | Bar chart | Average | Not seen | Heatmap | Average, bars per star | Highest rated |
| Format, owned | Format | Not seen | Not seen | Format | Not on the page | Not in the list |
| Length | Pie chart | Shortest, longest | Not seen | Groups | Average, shortest, longest | Longest, shortest |
| Moods, pace | Yes | Not seen | Not seen | Moods | No | No |
| Time and speed | Not seen | Not seen | Yes | Hours listened | No | Fastest read |
| First and last book | Not seen | Not seen | Not seen | Not seen | Bookends | Bookends |
| Heatmap, streak | Not seen | Not seen | Streak | Not seen | No | Cancelled |
| Period filter | Year, month, custom (paid) | Year | Book, month, year | Not verified | Year | Year, month |

"Not seen" means no search result showed it. It does not mean the product lacks it.

## What this means for us

Observations only. Each pattern was seen at least twice; each pitfall has a reporter.

Patterns:

1. **The feature list is short and the same everywhere.** Books, pages, average rating, top genres, shortest and longest, first and last book: BookHive, Papertrail Covered and Goodreads. Heatmaps, streaks and pace are in designs that were cancelled (Papertrail #50, #52) or need timed sessions (Bookly).
2. **The only filter is the period.** One year in BookHive; year or month in Papertrail; "any year, or all time" in the cancelled design; periods in teal.fm, Fathom and Rocksky.
3. **Pages and genres come from the catalogue.** BookHive takes the reader's own page total first, then the catalogue; genres come from the catalogue only. Papertrail's design and Hardcover do the same.
4. **The page says what data is missing.** BookHive ("Add page counts to your books…", the 3-book threshold); Hardcover ("Missing data from N books").
5. **Simple drawing.** BookHive draws bars with `div`s and no library. Papertrail's design asks for "a text or table equivalent" of each chart.
6. **Two ways to compute.** A server index of public records (BookHive, Rocksky, teal.fm), or the device from the reader's own records (Fathom, Tourmaline; Papertrail by its own description). Atomes already computes on the device (ADR 0010, "Computed, never stored", as cited in ADR 0012).
7. **Sharing is a public link with Open Graph data.** BookHive draws a picture on the server for each card; Papertrail reuses the cover or avatar. Both need a public page with public data. A post with a picture is not built in either.
8. **Statistics by period need a finish date; pace needs a start date; ratings need a rating.** BookHive's record has all three, plus `previousReads` and `owned`. `app.atomes.readingStatus` has an optional `finishedAt` only, and one record per Work. `app.atomes.copy` has `acquiredAt`. So "fastest read", "highest rated", rating bars and re-reads have no data here.
9. **All found statistics are over public records, and `owned` is public in BookHive.** Atomes would compute over Private records on the instance (ADR 0012). GLOSSARY says Copies are never Shared. No reference project shares a total of private or owned-book data, so there is no pattern to copy for that part.
10. **A community book lexicon now exists** (`community.lexicon.media.book`: edition, review). ADR 0004 says to reuse a community lexicon when one covers a concept. Whether it covers Reading Status is not verified; no file is named for it.

Pitfalls reported:

| # | Pitfall | Reported by |
|---|---|---|
| 1 | Progress with one timestamp cannot give streaks or reading days | BookHive `defs.json`; Papertrail issue #52 |
| 2 | Two code paths count a year differently (local time or UTC; re-reads or not), so the page and the share card can disagree | BookHive `readingStats.ts`, `socialCards.ts`, `ARCHITECTURE.md` (as read by the fetch tool) |
| 3 | A genre bar that divides by the sum of genre counts counts a book several times | BookHive `readingStats.tsx` (as read by the fetch tool) |
| 4 | A server index can be stale or absent | BookHive issue #242; Fathom README |
| 5 | A single-page app shows a crawler no Open Graph tags; the fix is a server function for crawlers | Papertrail PR #89 |
| 6 | A compose link cannot carry a picture, and a URL in it may give no card | Intent links doc (spike 0005); social-app issue #5738 |
| 7 | A link card is fixed at post time | Bluesky posting guide (spike 0005; inferred) |
| 8 | A blob scope cannot go in a permission set, and a new scope needs a new sign-in | Permission spec; spike 0003 |
| 9 | Page totals are wrong with audiobooks or another edition | Goodreads readers |
| 10 | Two apps that write the same total record can overwrite each other | Papertrail issue #2 |
| 11 | Small counts can reveal the items behind a total | "Analytics over ATProto" thread |
| 12 | A statistics design can be dropped a day after it is written: check an issue's state before citing it as a plan | Papertrail issues #50, #52 |

## Not verified

- **Sections B and E**: no page opened. teal.fm's `fm.teal.stats.*` queries, Rocksky's stats and Wrapped answers, how the "wrapped" and heatmap tools read data, and the current features of StoryGraph, Goodreads, Bookly and Hardcover.
- BookHive:
  - `src/routes/og.tsx`: the card size, the fifth card, and which page sets `og:image` to which card. Whether the stats page has its own card.
  - Reading goals: only the home page excerpt says it.
  - Whether a signed-out visitor can open `/profile/<actor>/stats`.
  - The local-time and re-read differences (pitfall 2) and the genre bar (pitfall 3): read in code by the fetch tool, not run.
  - The OAuth scope BookHive asks for. What "Year in Books" looks like on screen.
- Papertrail: where Covered is computed (no code read). The current OAuth scope string. The state of issues #62 and #87. How "One tap opens a Bluesky post" works.
- Popfeed: every field name (no published schema; the goal fields are inferred by Papertrail). Whether a statistics page or a year in review exists.
- Skylights: its lexicon and its state. The listed folder URL is 404.
- ShelfCheck: the names of its date fields and its rating scale (`public/lexicons/` not read).
- `community.lexicon.media.book.*`: the fields of `defs.json` and `review.json`, and whether a reading status is defined. The absolute commit date.
- cardyb: no official document. That `text` is the only compose parameter in the app's code.
- Permission sets "since late 2025" (Scope Builder guide not opened). `transition:generic` wording (OAuth spec not opened in this spike).
- Spaces: whether the new docs and SDK are out.
- "Bookmarker" or "Shelf" apps, "Byline", `kirbi-pds`: names seen, not checked.

## Method

- Passes 1 and 2 (2026-11-18): web search only, mostly limited to each source's own domain. Page fetches were refused. Pass 2 took the picture limit, the intent link quotes and the link card quote from spike 0005.
- Pass 3 (2026-11-18): 25 page fetches.
  - BookHive (9): `lexicons/defs.json`, `lexicons/book.json`, the repo page, `ARCHITECTURE.md`, `AGENTS.md`, the `src` folder, `src/pages/readingStats.tsx`, `src/data/readingStats.ts`, `src/data/socialCards.ts`.
  - Papertrail (7): the repo page, issues #2, #50, #52, #54, pull requests #6 and #89.
  - Official (2): `atproto.com/specs/permission`, the Spaces public beta post.
  - Community lexicon (5): two Tangled folder pages, two Tangled file pages (no content returned), MarshalX PR #3.
  - Others (2): the ShelfCheck README, the Skylights lexicon folder (404).
- What pass 3 corrected: Papertrail's dashboard and streaks are cancelled, not planned; Papertrail is not browser-only; BookHive draws share pictures on the server (the first version had "purpose not verified"); the community book lexicon is in the community repository.
- Queries used project and record names only. No person's name and no project name of ours.
- Repo files read: `docs/spikes/0001` to `0003` and `0005`, `GLOSSARY.md`, ADR 0004, 0008 and 0012, `lexicons/app/atomes/readingStatus.json` and `copy.json`.
- Next pages to open: BookHive `src/routes/og.tsx`; the raw files of `community/lexicon/media/book`; Papertrail `src/lib/oauthConfig.ts` and the Covered source.
