# The Shelf Check look for the whole app, in both themes

Status: accepted (2026-11-17). Replaces the Linear-based rules for surfaces in `docs/design/ui-direction.md` (2026-11-04). Built in milestone "M10 · One look", tokens in CORE-121.

The Shelf Check result screen (CORE-120) brought a new look: soft glows behind the content, text and fills as levels of ink, filled buttons with large corners, chips and cards. It was always dark, and its two colours (green, orange) were for that screen only. The rest of the app kept the Linear rules: quiet chrome, cobalt "never a fill", outlined primary actions. Two looks in one app read as two apps. Decision (grilling of 2026-11-15, follow-up of 2026-11-17): **every screen takes the Shelf Check look, in light and in dark.**

## What changes

- **Both themes, always.** Every screen follows the Appearance setting, the Shelf Check result screen too: it is no longer always dark. In light it uses the app's ground and ink; green and orange text take darker shades so they stay readable; glows show at half strength. In dark it uses the app's dark ground and ink.
- **One set of tokens.** Every value a screen needs is a token in `src/styles/theme.css`: corners, type sizes, space, button and icon-button sizes (phone and desktop), alpha levels of ink for text, lines and fills, glows (gradient stops, padding, blur), motion durations and easing, `--font-tech`. A screen types no raw px, hex or alpha; `theme.test.ts` checks the Shelf Check screen and the contrast of each colour token.
- **High contrast moves the new levels too.** `--contrast` already moves secondary text and lines toward ink; it now moves the text levels, the lines and the ownership text of the one look the same way.
- **Cobalt fills the main action.** The "cobalt, never a fill" rule goes: the one main action of a screen is filled cobalt, in light text (CORE-122). A screen shows at most one.
- **Green and orange answer ownership, wherever it is answered.** Green: the reader does not own the book (or a Volume is Missing). Orange: they own it. They move from "Shelf Check only" to every place that answers ownership (Series page spines and counts, the "not owned" mark in the Library), and nowhere else. The one exception: the orange ground of the Staging, Preview and Local app icons, which live outside the app.

## What stays

- The frame: sidebar, view header, panel and tab bar (Q13). Desktop lists and toolbar rows stay dense: `--row` does not change (Q12).
- The canvas colours (`--ground`, `--ink`, `--accent`…) and the derivation of secondary text, lines and inactive controls from `--contrast`.
- Danger (muted red) and caution (yellow) keep their roles.
- The camera views keep their own, unthemed colours: the picture sets the light.

## Rejected

- **Keep the Shelf Check screen always dark.** It was the one screen that ignored Appearance; a reader in light mode met a black screen in the middle of a light app.
- **Give the Shelf Check screen its own dark ground and ink** (`#0e0f0c`, `#f3f1ea`, as CORE-120 had). The difference to the app's dark canvas is a few steps of lightness; one ground and one ink let every screen use the same text and fill levels.
- **Make the levels a generator** (as Linear did for themes). The canvas pairs stay the source; the levels are fixed shares of ink, so the tuned canvas colours do not move.

## Consequences

- Each screen ticket of M10 moves its screen onto the tokens and the shared parts (CORE-122) and drops its raw values.
- The Sign-in Code email copies cobalt, ink and ground as hex (`src/lib/server/mail-html.ts`); M10 does not change those values.
- `ui-direction.md` holds the token table and the rules; this record holds the reasons.
