## Commands

Needs Node 22.23.4+ (exact version in `.nvmrc`; Astro 7 needs at least 22.23.4) and Bun (`packageManager` in `package.json`). Bun installs and runs scripts; Node runs Astro and Vitest.

- `bun install` — install dependencies. Run `bun install --frozen-lockfile` again after a merge or rebase that changes `bun.lock`: Jean installs only when it creates the worktree.
- `bun run check` — type check (`astro check`)
- `bun run lint` — lint (ESLint, type-aware rules, Astro and a11y rules).
- `bun run test` — run tests (Vitest). Never `bun test`: that starts Bun's own test runner, not Vitest.
- `bun run test:e2e` — E2E journeys in a browser (Playwright, `e2e/`), in Chromium and WebKit at 390 px wide. Playwright starts its own dev server on http://127.0.0.1:4322 with the recorded Catalog, an empty `data-e2e/` and throwaway settings (`playwright.config.ts`); it never reuses a running server. `E2E_PORT=<port>` moves it, for runs in two worktrees at once. First time: `bunx playwright install chromium webkit`. On a failure, open the trace: `bunx playwright show-trace test-results/<test>/trace.zip`. Before you push a new or changed spec, run it again with `E2E_SLOW_SCRIPTS=300` (each page script comes 300 ms later, as on the CI runner): a test that taps before a script has run then fails here, not only in CI (`e2e/test.ts`; UI rule "Before the scripts run" in `docs/design/ui-direction.md`). Higher values only time out: the dev server loads modules in a long chain. Each spec file signs in as its own reader (`e2e/readers.ts`); import `test` from `e2e/test.ts`, which fails a test that calls a host other than the dev server.
- `bun run build` — build the Node server into `dist/`
- `bun run dev` — dev server on http://127.0.0.1:4321 (not `localhost`: the OAuth loopback client needs a loopback IP; `localhost` pages move there)
- Hand tests in a browser: on `bun run dev`, open http://127.0.0.1:4321/dev/sign-in-as to sign in with no PDS and no Invite, as `did:plc:testreader` (or `?did=<did>&handle=<handle>`). It makes the Account of the DID at its first use, so the E2E readers need no Invite. It lands on the Library. 404 in a built server. It is enough while the Library stays on this server (`library.sqlite`); data on the PDS will need the real sign-in.
- `bun run reset [--keep-catalog]` — empty the SQLite files in `DATA_DIR` in place (sessions, Library, Catalog). The dev server can keep running; every browser must sign in again. PDS records do not change. On Coolify: `node scripts/reset-env.ts` in the app Terminal (`docs/staging-coolify.md`, "Reset the data"); production also needs `--production`.
- `bun scripts/invite.ts` — print one Invite link (works once, 14 days; ADR 0016). A new Account needs one (`SIGN_UP=invite`, the default). The server must have started once. On Coolify: `node scripts/invite.ts` in the app Terminal.
- `bun scripts/role.ts grant|revoke <email address or DID>`, `bun scripts/role.ts list` — the Admin role (ADR 0020): the first Admin comes from here. Grants only to an Account that exists, makes none; can revoke the last Admin, with a warning. The server must have started once. On Coolify: `node scripts/role.ts …` in the app Terminal. An Admin opens the admin panel at `/admin` (a link in Settings); anyone else gets a 404.
- `bun scripts/record-catalog-answers.ts <isbn>…` — ask the real book sources and save their answers in `src/lib/catalog/fixtures/` for the Catalog tests. `--fill <isbn>…` also records the whole Edition Line; `--search "<title>" ["<publisher>"]` records a BnF search; `--find "<words>"` records a Search (ADR 0021) and the Editions of its first Work (`src/lib/catalog/fixtures/README.md`). Review the diff before you commit: the sources change their data.
- `node scripts/release.ts prepare --dry-run` — print the release PR the bot would make now (title, Before you deploy steps, notes); needs `gh` signed in. The Release workflow runs `prepare` after each merge to `main` and `publish-notes` when the release PR merges (README, "Releasing").
- `scripts/setup-release-token.sh` — interactive wizard: make the `RELEASE_TOKEN` fine-grained token and save it as a GitHub secret. Run it again to renew the token.
- `bun run phone` — check the settings, build, then run the built server with `.env.phone`, for a test on a phone over HTTPS (`docs/phone-https.md`).
- `bun run preview` — `astro preview` of `dist/`. No doc or job uses it: to run the built server, use `bun run phone` or Docker (`README.md`, "Run with Docker").
- `NODE_ENV=development node --env-file=.env.local scripts/check-settings.ts` — check the settings with no server. Without `NODE_ENV=development` it checks them as a built server (needs `SMTP_URL` and `MAIL_FROM`). The Docker image and `bun run phone` run it before the server starts; a wrong setting stops the start.
- `bun scripts/repair-shared-works.ts [--dry-run]` — repair the reader records that name a Work the Catalog dropped (ADR 0010). The server already does it at its first health check after each start; use `--dry-run` to see the Labels and Private Works it lists. Runs again with no change. On Coolify: `node scripts/repair-shared-works.ts` in the app Terminal (`docs/staging-coolify.md`).
- `bun scripts/link-series.ts <Series identifier> <Series identifier>` — link two identifiers of one Series by hand, when no source does (ADR 0010, `same_as`). It opens `catalog.sqlite` in `DATA_DIR` and asks no source; reader records do not change. Bun only: the Docker image does not have it.
- `bun scripts/icons.ts` — draw again every app icon under `public/` (SVG, then PNG with resvg) and the mark colours of the Sign-in Code mail (`src/lib/server/mail-mark.ts`), from the mark and the `--ground`, `--ink`, `--accent` and `--alpha-shade-faint` tokens of `src/styles/theme.css`. Run it after you change one of them: `scripts/icons.test.ts` fails while the files differ.
- `node dist/backup.mjs backup`, `node dist/backup.mjs restore <stamp>` — encrypted backup of the SQLite files to S3, and restore. `bun run build` makes `dist/backup.mjs`. Needs the `BACKUP_*` settings: `docs/backups.md`.
- `LEXICON_APP_PASSWORD=<app password> bun scripts/publish-lexicons.ts` — owner only: publish each file of `lexicons/` as a `com.atproto.lexicon.schema` record on the owner's Bluesky account, so other apps resolve `app.atomes.*`. Run it after each lexicon change; a change must stay backward compatible (ADR 0010). Never commit the app password; revoke it after use.
- `scripts/coolify-setup.sh` — interactive wizard for the first Coolify set-up (DNS, HTTPS, staging, production, backups). **Out of date**: it asks for `ALLOWED_DIDS`, which the server no longer reads, and does not set `SMTP_URL`, `MAIL_FROM`, `LEGAL_*` or `PRIVACY_*`. Follow `docs/staging-coolify.md` instead.
- `bun run landing-shots` — remake the app screenshots of the Landing page in `public/landing/<en|fr>/` (Home, Library, Series, Shelf Check owned and not owned, To Buy, Statistics; 390 and 1440 px, light and dark, English and French; WebP), then the share preview `preview.jpg` of each language (1200 × 630, the top of `/welcome`; `--preview` makes only these two, in about 30 s). It starts its own dev server on port 4330 (`LANDING_PORT`) on the real book sources with an empty `data-landing/`, fills a demo Library of manga, comic books and novels with their real covers (a book whose cover does not load is left out; `--probe` only lists which books have one), and fails when the browser asks another host. About 12 minutes, with network. Run it again when a screen it shows changes.
- `CHANGELOG_SOURCE=recorded`: in development only, What's new (`/changelog`) answers from the recorded GitHub Releases (`src/lib/server/changelog.fake.ts`: the real v1.0.0 and a sample v1.1.0 with every category) instead of the GitHub API. The E2E server sets it. A built server ignores it.
- `CATALOG_SOURCES=recorded DATA_DIR=data-e2e bun run dev` — dev server whose Catalog answers from these recorded answers, with no network (E2E and agent tests). Recorded ISBNs: `src/lib/catalog/fixtures/README.md` (9782723478991 is One Piece 56; 9791099999993 is unknown to every source). Any other ISBN is unknown, and there is no cover. Keep the separate `DATA_DIR`: a `catalog.sqlite` filled from recorded answers must not mix with the real local Catalog. A built server ignores the setting.

`jean.json`: in each new worktree, Jean copies the `.env*` files of the base project (`$JEAN_ROOT_PATH`, top level only) and runs `bun install --frozen-lockfile`. Its Run command is `bun run dev`.

CI (`.github/workflows/ci.yml`) runs check, lint, test and build on every pull request, each on its own runner (`verify` jobs), with no secrets; the `check` job is green when all four are. The E2E journeys run on 8 runners at the same time (`e2e-shard` jobs, `playwright test --shard=<n>/8`: one dev server serves 2 workers well, not more); on a pull request, the `e2e-slow` job runs each new or changed `e2e/*.spec.ts` once more with `E2E_SLOW_SCRIPTS=300`. The `e2e` job is green when they are. A failed E2E job keeps its traces as a `playwright-traces-<shard>` (or `playwright-traces-slow`) artifact. `check` and `e2e` are required checks of `protect-main`, as is `pr-title` (`.github/workflows/pr-title.yml`): keep these two job names. The E2E jobs run in the Playwright image (`mcr.microsoft.com/playwright:v<version>-noble`), which holds the browsers and their system packages: when you change the `@playwright/test` version in `package.json`, change the image tag in `ci.yml` too. Setup steps live in `.github/actions/setup`. Its `image` job builds the `Dockerfile` and waits for the container health check. Tests must never call a real PDS or a real book source (the Catalog tests use recorded answers). The Catalog stores its SQLite file in `DATA_DIR` (`data/` in development).

`main` is protected by the GitHub ruleset `protect-main`: direct pushes, force pushes and deletion are refused, and a pull request merges only when the CI `check` and `e2e` jobs and the `pr-title` check are green, by squash only. `production` (the branch production deploys from) refuses deletion and force pushes. Never merge without the owner's review.

## Agent skills

### Issue tracker

Issues live in Linear, team `CORE`, project `atomes`, one milestone per gate. See `docs/agents/issue-tracker.md`.

Before any work on a ticket, fetch it with its relations (Linear MCP `get_issue` with `includeRelations`). If a "blocked by" ticket is not Done or Canceled, do not start: tell the user and ask whether to work on the blocker first. The context Jean loads for a ticket does not list its relations. The SessionStart hook (`scripts/check-blockers.ts`) also checks the ticket of the branch, and needs `LINEAR_API_KEY` or `LINEAR_API_KEY_FILE` in `.env.local`.

The Linear MCP (`linear-server`, user level) can connect a few seconds after the session starts. Load its tools by name first (ToolSearch `select:mcp__linear-server__get_issue,mcp__linear-server__list_comments`), and read the comments too: triage decisions are there. Jean starts a sub-session (a run that another session starts with `send_chat_message`) with the `jean` MCP only, so a sub-session has no Linear tools. There, the **orchestrator brief** replaces the fetch. The orchestrator fetches the ticket through the Linear MCP and puts in the brief: the status, each "blocked by" ticket with its status, the comments, and the description word for word. With that brief, the sub-session starts, and checks the blockers from the brief. In any other session where the tools are still missing, stop and tell the user to check `/mcp`. Reach Linear only through the MCP or an orchestrator brief: never read `.env.local` or write a GraphQL script, and never start from the Jean context alone.

### Triage labels

Default five triage roles, used as Linear labels with the same names. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Pull requests

Write every pull request body with the `mattpocock-skills:pr` skill: sections Summary, Evidence, Merge Danger, in the words of `GLOSSARY.md`. Use it for new pull requests and when you rewrite a pull request body.

Releases come from PR titles and bodies (README "Releasing", `scripts/release.ts`):

- **Title:** Conventional Commit with the milestone or ticket as scope: `feat(M14): …` (minor), `fix(CORE-123): …` (patch), `perf:` / `refactor:` (patch), `!` after the type (major). `docs:`, `ci:`, `chore:`, `test:`, `build:`, `style:`, `revert:` go to Maintenance, by title only, and bump no version. The required `pr-title` check refuses any other title.
- **Body:** after Summary, Evidence, Merge Danger, always end with `## Release notes`: text for readers, in the words of `GLOSSARY.md`; `none` when readers see no change. A breaking change needs `### Migration`. A step on production before the deploy (a Coolify setting, a script) goes in `### Before you deploy`.
- **Check before opening:** `PR_TITLE='…' PR_BODY="$(cat body.md)" PR_HEAD=<branch> node scripts/release.ts check-pr`.
- **Merge:** squash only. Never change the bot's `chore(release): vX.Y.Z` PR by hand, except its highlights block. Merging it deploys production.

### UI

Frame, colour roles, density and behaviour rules: `docs/design/ui-direction.md`. Read it before building any screen; use `AppShell` and the tokens in `src/styles/theme.css`, never raw hex.

Every UI string comes from `t(key)` (`src/lib/i18n`, ADR 0015): add each new text to `en.ts` and `fr.ts`, with the French word of `GLOSSARY.md` for each term. Sort text with `compareText(language)`, never a bare `.sort()`.
