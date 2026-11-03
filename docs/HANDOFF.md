# Handoff: start building Atomes locally

Written 2026-11-03 at the end of a design conversation in claude.ai. The next session runs in Claude Code on the owner's machine.

## What the next session is for

Turn this folder into the Atomes repository and complete **Phase 0** (repo foundations) and **Phase 1** (spike the hard parts) of the build guide. No server needs to be rented yet: the app runs locally, and the test account lives on Bluesky's hosted Spaces alpha PDS.

## Read these first (do not re-derive them)

| What | Where |
| --- | --- |
| Domain glossary (use these words in code, UI and tickets) | `CONTEXT.md` |
| Architecture decisions | `docs/adr/0001` to `0005` |
| Architecture diagrams (6 figures: deployment, visibility, data model, New Volume alert, Quick Add, Shelf Check) | `docs/architecture.html` (open in a browser) |
| Build guide: AT Protocol primer, roadmap with phases and gates, hosting, costs, risks | Claude Doc "Atomes — step-by-step build guide": https://claude.ai/artifact/CejTumXCG6FXS1JWaYhr2G |
| Screen designs: 13 screens, desktop and mobile, light and dark, clickable | Design canvas: https://claude.ai/artifact/PqRAzaTcVkYY8p6EfeKJpB |
| Generator source of those screens (tokens, sample data, search, sort, filter and cover flow logic) | `docs/design/source/*.py` (reference only, not production code) |

The two claude.ai links need the owner's login; an agent cannot open them. Ask the owner for screenshots, or read `docs/design/source/` for exact values.

## Decided in conversation but not yet in an ADR

Write these up as ADRs when the repo is created (suggested numbers in brackets):

- **Licences** [0006]: application and Catalog under AGPL-3.0, so hosted forks stay open; lexicons under MIT (or CC0) so any app can adopt them.
- **Runtime and storage** [0007]: Astro in server mode with the Node adapter, shipped as one Docker image; the Catalog uses SQLite (Postgres if it outgrows it). Supabase is not used. Self-hosters run the same image.
- **No AppView in v1**: the app reads and writes the owner's PDS directly. Records must be designed so an indexer can be added later without migrating data.

## Product details agreed after the ADRs

- **Library modes**: Grid, List and Cover flow share one toolbar: search, "Search in" (all fields, title, author, series name, volume title), Sort (title A to Z, author, series and volume, recently added), filters by author, series, reading status and Label, a result count and "Clear all".
- **List mode** groups books under letter headers taken from the sort field (title, author surname, or series name) with an A to Z jump index. "Recently added" is one group. Leading articles (La, Le, The) currently count; ignoring them is an open question.
- **Labels**: personal, Private by default, filterable in every mode, editable on the Book page; the Catalog may suggest some.
- **Search ignores accents** ("asterix" finds "Astérix").
- **Reading Status** values: unread, reading, read, abandoned; one per Work, optional finish date, re-reads not tracked.
- **Unknown books**: manual entry; the owner may choose their own photo as the cover, the one exception to "photos are never stored".

## Design tokens (from the canvas)

- Font: Schibsted Grotesk. Icons: Lucide, 1.75 stroke.
- Light: ground #F6F6F3, surface #FFFFFF, ink #17181C, secondary text #5C606A, lines #E3E3DE, soft fill #ECECE6, accent cobalt #2E46D1, accent tint #E9ECFB.
- Dark: ground #121317, surface #1B1D22, ink #F1F1EC, secondary text #A3A7B0, lines #2C2F36, soft fill #25282E, accent #8A9BFF, accent tint #1F2547.
- Signature motif, the volume spine row: filled = read, outlined = owned not read, dashed grey = missing, filled accent = New Volume, dashed accent = Upcoming Volume. The wordmark is three spines and a gap.
- Appearance setting: System, Light, Dark. Covers and the camera view keep their colours in both themes.

## Pointers for Phase 1

- The Spaces alpha ships `@atproto` TypeScript packages under the `alpha` npm tag, and a sample app, `bluesky-social/bulletin`, that uses them. Start from it. Source: https://atproto.com/blog/atproto-spaces-alpha
- Invites to the hosted alpha PDS come from the owner's Bluesky account page, as that post explains. The owner does this step.
- Check how AT Protocol OAuth handles local development (a loopback client on localhost) before building sign-in; do not assume.
- The alpha PDS is updated on Thursdays and may wipe data. Keep all Space code behind one small module.

## Never

- Never put the owner's real Library on the alpha PDS.
- Never send Library data to the Atomes server; it only knows books (ADR 0001).
- Never commit secrets; the owner keeps passwords and keys.
- Never merge to main or deploy without the owner's review.

## Suggested first steps

1. Create the GitHub repository from this folder and push it.
2. Write `CLAUDE.md` with the rules above and pointers to `CONTEXT.md` and the ADRs.
3. Add ADRs 0006 and 0007.
4. Set up an Astro project with a test runner and a CI job on pull requests.
5. Turn Phase 1 of the build guide into tickets, then build them one by one, tests first.

## Suggested skills

- `setup-matt-pocock-skills`: configure the repo's issue tracker and docs layout before the other engineering skills.
- `writing-for-agents`: write `CLAUDE.md`.
- `domain-modeling`: keep `CONTEXT.md` and the ADRs current as terms and decisions change.
- `grill-with-docs`: when a new design question comes up.
- `to-spec`, then `to-tickets`: turn Phase 1 into tickets.
- `tdd` and `implement`: build each ticket.
- `code-review`: before each merge.
- `frontend-design`: when building screens from the canvas.
- `diagnosing-bugs`: when something breaks.
