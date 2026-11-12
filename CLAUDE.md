## Commands

Needs Node 22.23.4+ (exact version in `.nvmrc`; Astro 7 needs at least 22.23.4) and Bun (`packageManager` in `package.json`). Bun installs and runs scripts; Node runs Astro and Vitest.

- `bun install` — install dependencies. Run `bun install --frozen-lockfile` again after a merge or rebase that changes `bun.lock`: Jean installs only when it creates the worktree.
- `bun run check` — type check (`astro check`)
- `bun run lint` — lint (ESLint, type-aware rules, Astro and a11y rules).
- `bun run test` — run tests (Vitest). Never `bun test`: that starts Bun's own test runner, not Vitest.
- `bun run test:e2e` — E2E journeys in a browser (Playwright, `e2e/`), in Chromium and WebKit at 390 px wide. Playwright starts its own dev server on http://127.0.0.1:4322 with the recorded Catalog, an empty `data-e2e/` and throwaway settings (`playwright.config.ts`); it never reuses a running server. First time: `bunx playwright install chromium webkit`. On a failure, open the trace: `bunx playwright show-trace test-results/<test>/trace.zip`. Each spec file signs in as its own reader (`e2e/readers.ts`); import `test` from `e2e/test.ts`, which fails a test that calls a host other than the dev server.
- `bun run build` — build the Node server into `dist/`
- `bun run dev` — dev server on http://127.0.0.1:4321 (not `localhost`: the OAuth loopback client needs a loopback IP; `localhost` pages move there)
- Hand tests in a browser: on `bun run dev`, open http://127.0.0.1:4321/dev/sign-in-as to sign in with no PDS, as the first DID of `ALLOWED_DIDS` (or `?did=<did>&handle=<handle>`). It lands on the Library. 404 in a built server. It is enough while the Library stays on this server (`library.sqlite`); data on the PDS will need the real sign-in.
- `bun run reset [--keep-catalog]` — empty the SQLite files in `DATA_DIR` in place (sessions, Library, Catalog). The dev server can keep running; every browser must sign in again. PDS records do not change. On Coolify: `node scripts/reset-env.ts` in the app Terminal (`docs/staging-coolify.md`, "Reset the data"); production also needs `--production`.
- `bun scripts/record-catalog-answers.ts <isbn>…` — ask the real book sources and save their answers in `src/lib/catalog/fixtures/` for the Catalog tests
- `CATALOG_SOURCES=recorded DATA_DIR=data-e2e bun run dev` — dev server whose Catalog answers from these recorded answers, with no network (E2E and agent tests). Recorded ISBNs: `src/lib/catalog/fixtures/README.md` (9782723478991 is One Piece 56; 9791099999993 is unknown to every source). Any other ISBN is unknown, and there is no cover. Keep the separate `DATA_DIR`: a `catalog.sqlite` filled from recorded answers must not mix with the real local Catalog. A built server ignores the setting.

`jean.json`: in each new worktree, Jean copies the `.env*` files of the base project (`$JEAN_ROOT_PATH`, top level only) and runs `bun install --frozen-lockfile`. Its Run command is `bun run dev`.

CI (`.github/workflows/ci.yml`) runs install, check, lint, test and build on every pull request, with no secrets. Its `e2e` job runs `bun run test:e2e` and keeps the traces of failed tests as the `playwright-traces` artifact; it is advisory (not a required check of `protect-main`). Its `image` job builds the `Dockerfile` and waits for the container health check. Tests must never call a real PDS or a real book source (the Catalog tests use recorded answers). The Catalog stores its SQLite file in `DATA_DIR` (`data/` in development).

`main` is protected by the GitHub ruleset `protect-main`: direct pushes, force pushes and deletion are refused, and a pull request merges only when the CI `check` job is green. Never merge without the owner's review.

## Agent skills

### Issue tracker

Issues live in Linear, team `CORE`, project `atomes`, one milestone per gate. See `docs/agents/issue-tracker.md`.

Before any work on a ticket, fetch it with its relations (Linear MCP `get_issue` with `includeRelations`). If a "blocked by" ticket is not Done or Canceled, do not start: tell the user and ask whether to work on the blocker first. The context Jean loads for a ticket does not list its relations. The SessionStart hook (`scripts/check-blockers.ts`) also checks the ticket of the branch, and needs `LINEAR_API_KEY` or `LINEAR_API_KEY_FILE` in `.env.local`.

The Linear MCP (`linear-server`, user level) can connect a few seconds after the session starts. Load its tools by name first (ToolSearch `select:mcp__linear-server__get_issue,mcp__linear-server__list_comments`), and read the comments too: triage decisions are there. If the tools are still missing, stop and tell the user to check `/mcp`. Never read `.env.local` or write a GraphQL script to reach Linear instead, and never start from the Jean context alone.

### Triage labels

Default five triage roles, used as Linear labels with the same names. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Pull requests

Write every pull request body with the `mattpocock-skills:pr` skill: sections Summary, Evidence, Merge Danger, in the words of `GLOSSARY.md`. Use it for new pull requests and when you rewrite a pull request body.

### UI

Frame, colour roles, density and behaviour rules: `docs/design/ui-direction.md`. Read it before building any screen; use `AppShell` and the tokens in `src/styles/theme.css`, never raw hex.

Every UI string comes from `t(key)` (`src/lib/i18n`, ADR 0015): add each new text to `en.ts` and `fr.ts`, with the French word of `GLOSSARY.md` for each term. Sort text with `compareText(language)`, never a bare `.sort()`.
