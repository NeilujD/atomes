# UI direction: what Atomes takes from Linear

Status: proposed, 2026-11-04. Applies to every screen. Code: `src/styles/theme.css`, `src/layouts/AppShell.astro`.

Source: Linear, ["How we redesigned the Linear UI (part II)"](https://linear.app/now/how-we-redesigned-the-linear-ui), 28 March 2024. The screen designs stay the reference for content (`docs/design/source/`, canvas link in `docs/HANDOFF.md`); this document changes the frame around them.

## In short

Atomes keeps the canvas colours, font and screens, and takes four ideas from Linear:

1. **The chrome is an inverted L.** On desktop, the sidebar and the view header frame one content panel. On the phone, the same parts become a large title and a tab bar.
2. **The chrome is quiet; covers bring the colour.** Navigation uses greys only. Cobalt has one meaning: something new in a Series.
3. **Few colour inputs, the rest derived.** One `light-dark()` pair per canvas colour, plus one contrast value that makes a high-contrast mode.
4. **Define behaviour before screens, then test it per view type.** The rules below come first; each new screen must fit them.

## What Linear did, and what Atomes does with it

| Linear decision | Atomes decision |
| --- | --- |
| Focus the redesign on ["this inverted L-shape"](https://linear.app/now/how-we-redesigned-the-linear-ui#:~:text=I%20started%20to%20focus%20on%20this%20inverted%20L%2Dshape): the global chrome that controls the main view. | Desktop: sidebar + view header around one panel that scrolls on its own. Phone: large title on top, tab bar at the bottom. One `AppShell` layout for both. |
| ["Reduce visual noise, maintain visual alignment, and increase the hierarchy and density"](https://linear.app/now/how-we-redesigned-the-linear-ui#:~:text=reduce%20visual%20noise%2C%20maintain%20visual%20alignment) of navigation. | Sidebar items are 32 px rows on one left edge, 16 px icons, no borders. The active item gets a soft fill, not a colour. Desktop sections are list groups on a hairline, not cards. |
| Themes from ["three: base color, accent color, and contrast"](https://linear.app/now/how-we-redesigned-the-linear-ui#:~:text=we%20defined%20three%3A%20base%20color%2C%20accent%20color%2C%20and%20contrast) instead of 98 variables per theme. | The canvas colours are typed once, as `light-dark()` pairs. Secondary text, lines and inactive controls derive from them with one `--contrast` value. See "Why not a full generator" below. |
| A contrast input gives high-contrast themes for accessibility. | `--contrast` is 0% by default and 45% when the OS asks for more contrast or the reader picks it in Settings. Measured: secondary text 6.3:1 to 10.7:1, lines 1.3:1 to 4.0:1 (light theme, on the panel). |
| ["Limiting how much chrome (blue in our case)"](https://linear.app/now/how-we-redesigned-the-linear-ui#:~:text=limiting%20how%20much%20chrome) goes into the neutrals, for a timeless look. | Neutrals keep the warm paper tint of the canvas, never cobalt. Cobalt marks New and Upcoming Volumes, links and focus rings, nothing else. |
| ["Making our text and neutral icons darker"](https://linear.app/now/how-we-redesigned-the-linear-ui#:~:text=making%20our%20text%20and%20neutral%20icons%20darker) in light mode, lighter in dark mode. | Secondary text stays at the canvas value (6.3:1 light, 7.0:1 dark), above WCAG AA. Icons use the text colour of their row. |
| [Inter Display](https://linear.app/now/how-we-redesigned-the-linear-ui#:~:text=We%20started%20using%20Inter%20Display) for headings, Inter for text. | One family, Schibsted Grotesk. Headings get weight 700 and negative tracking (-0.02em to -0.03em). Volume numbers and counts use tabular figures. |
| Navigation had to work in Electron and in a browser, so some controls had to be ["easily removable"](https://linear.app/now/how-we-redesigned-the-linear-ui#:~:text=needed%20to%20be%20easily%20removable). | Atomes runs in a browser tab, as an installed PWA, and on a phone in a shop with no signal. The shell needs no browser controls and respects safe-area insets. |
| Tests done ["by type of view"](https://linear.app/now/how-we-redesigned-the-linear-ui#:~:text=I%20mostly%20worked%20by%20type%20of%20view) (list, board, split...). | Stress-test list below, by Atomes view type. |
| Milestone 2: ["documented and defined the behaviors"](https://linear.app/now/how-we-redesigned-the-linear-ui#:~:text=documented%20and%20defined%20the%20behaviors) of sidebar, tabs, app and view headers before the build. | "Behaviour definitions" below. |
| ["A redesign should not completely disassemble the product"](https://linear.app/now/how-we-redesigned-the-linear-ui#:~:text=A%20redesign%20should%20not%20completely%20disassemble). | The canvas stays the content reference. Only the frame, density and colour roles change. |

## Where Atomes differs from Linear, and why

| Linear | Atomes | Reason |
| --- | --- | --- |
| Dense everywhere; keyboard first. | Dense with a pointer (32 px rows), roomy on touch (44 px rows, 48 px tab targets). Set by `pointer: coarse`, not by a preference. | The key moments (Shelf Check, Quick Add) happen on a phone, standing, often with one hand. |
| Content is text: issues, comments. | Content is covers. The panel is the plainest surface so covers carry the colour. | Covers keep their colours in both themes (canvas rule); grey chrome lets them stand out. |
| A full theme generator (custom themes). | Canvas pairs + one contrast value. No custom themes. | See below. |
| Team features: avatars, assignees, cycles. | One reader. The sidebar footer says "Private by default" instead of a workspace switcher. | Privacy is a product promise (ADR 0003); it stays visible. |
| The compose button is the main sidebar action. | "Check a book" is an outlined button on desktop and the large centre tab on the phone. | Shelf Check is a phone action; on desktop it is secondary. |

### Why not a full generator

The canvas light and dark colours do not follow one formula. As a share of ink mixed into the ground (OKLab lightness), the dark theme uses about 2 to 3 times bigger steps for fills and lines (soft fill 4.1% light against 11.6% dark; lines 7.6% against 15.3%). One formula would move the tuned canvas colours. A generator pays off only with custom themes, which Atomes does not plan. So the source stays the canvas pairs, and only the contrast step is derived.

Mix in `oklab`, not `oklch`: Chrome gives an `oklch` mix of near-greys the hue `none`, which paints as red.

## Changes against the canvas

| Area | Canvas | Now | Why |
| --- | --- | --- | --- |
| Desktop frame | Main area on the ground colour; content in separate cards. | One surface panel (12 px radius, 1 px line) beside the sidebar; sections are list groups on hairlines. | Inverted L; less noise. |
| Desktop nav | 44 px rows, 15 px text; active item is a white card with a border. | 32 px rows, 14 px text; active item is a soft fill. | Density and alignment of navigation. |
| Desktop page title | 32 px heading in the content. | 15 px title in a 48 px sticky view header. Large titles stay on detail pages (Book, Series), where the title is content. | The header holds the title and view actions, as in Linear. |
| "Check a book" on desktop | Solid ink button. | Outlined button. | One loud element per screen; on desktop that is content. |
| Phone | As the canvas. | As the canvas: large title, tab bar, Check in the centre. | Already right for one-hand use. |
| Contrast | None. | `--contrast`, from the OS setting or Settings. | Accessibility at no design cost. |

## Behaviour definitions

**Breakpoint.** Desktop frame from 960 px wide. Under 960 px, phone frame. Row height follows the input type: 32 px with a fine pointer, 44 px with a coarse pointer.

**Sidebar (desktop).** 232 px, fixed. Top row: mark and "Atomes" (links to Home), Search icon button (goes to Library search). Under it: "Check a book". Then Home, Library, New & upcoming, To Buy. Bottom: Settings and the line "Private by default". The active item has a soft fill and ink text; the others have secondary text. Hover gives the soft fill. No accent colour. New & upcoming may show a count of New Volumes, in tabular figures, never a coloured dot.

**Panel (desktop).** One surface panel, 8 px from the window edges. Only the panel scrolls; the sidebar stays.

**View header.** 48 px, sticky inside the panel, hairline under it. Left: page title (15 px, 600). Right: actions of the page (slot `actions`). On the phone: 28 px title, not sticky.

**View toolbar (Library only, to build).** A second header row under the view header, on desktop: search, "Search in", Sort, filters (author, Series, Reading Status, Label), result count, "Clear all", and the Grid / List / Cover flow switch at the right. On the phone, the same controls go in a sheet. The toolbar never changes the sidebar.

**Tab bar (phone).** Home, Library, Check, To Buy, You. Check is a 52 px ink circle in the centre, labelled for screen readers only. The bar sits on the surface colour with a top hairline and the bottom safe-area inset.

**Connection status.** As Linear does, the frame says when Atomes is offline; the pages do not. Desktop: a yellow box over the free space of the sidebar, right above Settings, so nothing in the sidebar moves. Phone: a yellow strip on top of the tab bar. Both read "Offline", then the number of saves waiting on this device, then a Reconnect button. Hidden while online. Offline means the browser says so, or a page could not reach the network and nothing answered since. Reconnect asks the Atomes server; if it answers, the pages read and send again at once. Caution colours (yellow) and the `wifi-off` icon, not red: Atomes still works offline, partly. Code: `src/lib/connection.ts`, `src/components/ConnectionStatus.astro`.

**Notices.** The result of an action (saved, waiting, refused) is a toast, over the page, so the content does not move: bottom right of the panel on desktop, above the tab bar on the phone. Errors stay until closed. A problem with what the reader typed stays next to the field. Code: `src/lib/toast.ts`.

**Appearance.** `color-scheme` follows the system. `data-appearance="light|dark"` on `<html>` forces one; `data-contrast="more"` raises contrast. Settings sets Appearance (System, Light, Dark), kept on the device; an inline script in `AppShell` applies it before first paint. Rule and storage: `src/lib/appearance.ts`. The contrast control is still to build.

**Colour roles.** Ink: text, read spines, primary buttons. Secondary: metadata, inactive navigation. Soft: fills, hover, active navigation. Line: hairlines, panel edge. Cobalt: New and Upcoming Volumes, links, focus. Caution (yellow, `--caution` on `--caution-tint`): the offline status, nothing else. Covers: their own colours, with a thin edge (`--cover-edge`).

## Stress test before building screens

Before a screen is built, check that its view type works in the frame, in light, dark and high contrast, on a 390 px phone and a 1280 px desktop:

| View type | Screens | Check |
| --- | --- | --- |
| Cover grid | Library (Grid), Home "Owned, not read yet" | Covers on the panel in both themes; cover edge visible. |
| List with groups | Library (List), New & upcoming, To Buy | Letter headers as list groups; A to Z index fits the panel edge. |
| Cover flow | Library (Cover flow) | Full panel width; toolbar stays visible. |
| Detail | Book, Series | Large title in content; spine row legible in high contrast. |
| Camera | Shelf Check, Quick Add (scan built: modal `<dialog>` in `src/pages/add.astro`, reader in `src/lib/scan/barcode.ts`) | Full screen on the phone (no tab bar); a card on desktop; colours not themed (`--camera`, `--camera-ink`); Close and "Type the ISBN" always reachable. The frame shows the reader's state: starting (dim), looking (a line sweeps; after 8 s a distance and light tip), wrong barcode (dashed, one shake, the reason), found (check mark and the ISBN for 0.6 s, a short vibration where supported). No motion with reduced motion. |
| Flow | Sign in (`AppShell flow`, `src/pages/sign-in.astro`), Series Onboarding | No sidebar or tab bar; one action per step; content centred (a card on desktop). The mark is the progress: books lift while working, a book lands in the empty slot when done; no motion with reduced motion. |
| Settings | Settings & privacy | Appearance and contrast controls. |

## Not now

- Command menu (⌘K) and keyboard shortcuts on desktop: useful later for Library search and Quick Add by ISBN; not before the screens exist.

## Assets

- Font: `@fontsource-variable/schibsted-grotesk` (OFL), self-hosted so it works offline. Imported once in `AppShell`.
- Icons: `@lucide/astro`, through `src/components/Icon.astro` (16 px, 1.75 stroke). Register a new icon in `src/components/icons.ts` first.
