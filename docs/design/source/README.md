# Canvas generator source (frozen)

These Python files generated the 13 screens of the design canvas (link in `docs/HANDOFF.md`). They are a snapshot from 2026-11-03, kept for reference. Do not edit them, and do not import them into the app.

They do not run in this repository: `lib.py` reads Lucide icons from a claude.ai sandbox path (`/home/claude/lucide/...`), and the output is the canvas format (`<x-dc>`), not HTML for Astro.

## Still the reference

- Colours (`THEMES` in `lib.py`) and font. The app uses the same values in `src/styles/theme.css`.
- The spine row (`spines()`) and the cover marks: unread, reading, lent (`cover()`).
- Sample data, and the search, sort, filter and cover flow logic (`library2.py`).
- The phone screens (`mobile()`).
- The content and order of each screen.

## Replaced by `docs/design/ui-direction.md`

- The desktop frame in `desktop()`: now a sidebar and a view header around one surface panel.
- Navigation rows of 44 px with 15 px text, and the active item as a white card with a border: now 32 px rows, 14 px text and a soft fill.
- The solid ink "Check a book" button in the sidebar: now an outlined button.
- The 32 px page title in the content, and desktop sections as cards (`card()`): now a 15 px title in the view header and list groups on hairlines.
- Settings > Appearance: will also get a contrast control (not built yet).

When the canvas and `ui-direction.md` disagree, `ui-direction.md` wins.
