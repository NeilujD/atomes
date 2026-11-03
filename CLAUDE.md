## Commands

Needs Node 22.23.4+ (exact version in `.nvmrc`; Astro 7 needs at least 22.23.4) and Bun (`packageManager` in `package.json`). Bun installs and runs scripts; Node runs Astro and Vitest.

- `bun install` — install dependencies
- `bun run check` — type check (`astro check`)
- `bun run test` — run tests (Vitest). Never `bun test`: that starts Bun's own test runner, not Vitest.
- `bun run build` — build the Node server into `dist/`
- `bun run dev` — dev server on http://localhost:4321

CI (`.github/workflows/ci.yml`) runs install, check, test and build on every pull request, with no secrets. Tests must never call a real PDS.

## Agent skills

### Issue tracker

Issues live in Linear, team `CORE`, project `atomes`, one milestone per gate. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five triage roles, used as Linear labels with the same names. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
