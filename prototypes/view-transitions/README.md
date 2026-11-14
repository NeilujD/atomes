# PROTOTYPE, throwaway: page transitions (CORE-90)

Not for `main`. The real build is CORE-90.

- `src/components/ViewTransitionsPrototype.astro`: the prototype (dev server only), with a variant switch at the bottom of the screen: `?vt=off|fade|morph|push|morph-push`, and Slow (1.6 s).
- `src/layouts/AppShell.astro`, `src/pages/book.astro`: the two hooks.
- `capture.mjs`: records each variant (Chromium phone + desktop, WebKit phone): a real-speed video and frozen frames. `build-preview.mjs` then writes `preview.html` next to it.
- `back.mjs <variant> <phone|desktop>`: frozen frames of Book -> Library (back), in `.ai/vt-preview/back/`.

Run: `bun run dev`, add One Piece 56 (9782723478991) to the dev Library, then `node prototypes/view-transitions/capture.mjs && node prototypes/view-transitions/build-preview.mjs`.
