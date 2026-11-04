## Commands

Needs Node 22.23.4+ (exact version in `.nvmrc`; Astro 7 needs at least 22.23.4) and Bun (`packageManager` in `package.json`). Bun installs and runs scripts; Node runs Astro and Vitest.

- `bun install` — install dependencies
- `bun run check` — type check (`astro check`)
- `bun run test` — run tests (Vitest). Never `bun test`: that starts Bun's own test runner, not Vitest.
- `bun run build` — build the Node server into `dist/`
- `bun run dev` — dev server on http://localhost:4321

`jean.json`: Jean runs `bun install --frozen-lockfile` in each new worktree, and `bun run dev` as its Run command.

CI (`.github/workflows/ci.yml`) runs install, check, test and build on every pull request, with no secrets. Tests must never call a real PDS.

`main` is protected by the GitHub ruleset `protect-main`: direct pushes, force pushes and deletion are refused, and a pull request merges only when the CI `check` job is green. Never merge without the owner's review.

## Agent skills

### Issue tracker

Issues live in Linear, team `CORE`, project `atomes`, one milestone per gate. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five triage roles, used as Linear labels with the same names. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Pull requests

Write every pull request body with the `mattpocock-skills:pr` skill: sections Summary, Evidence, Merge Danger, in the words of `GLOSSARY.md`. Use it for new pull requests and when you rewrite a pull request body.

### UI

Frame, colour roles, density and behaviour rules: `docs/design/ui-direction.md`. Read it before building any screen; use `AppShell` and the tokens in `src/styles/theme.css`, never raw hex.
