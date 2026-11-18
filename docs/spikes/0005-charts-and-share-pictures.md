# Spike: Charts and share pictures

Linear: CORE-143 (M11 · Statistics). Researched 2026-11-18. Web pages were opened on that date. Versions and release dates come from `npm view` on that date. Sizes come from the bundlephobia API (minified, then gzip). Code was read at pinned commits: atproto [`07d1f6b`](https://github.com/bluesky-social/atproto/tree/07d1f6b6a9df99bbc4a51a7b585db178289512d5) and bsky [`cb6d2ce`](https://github.com/bluesky-social/bsky/tree/cb6d2ce863352e26acdf35e660e365225e7edbae) (both 2026-11-17). The checks in "Method" ran in a scratch folder outside the repo. Nothing was installed.

The repo today: `node:22.23.4-alpine` (musl) in the `Dockerfile`, Astro `^7.4.5`, Preact `^11.2.0`, `@resvg/resvg-js` 2.6.2 as a devDependency (`scripts/icons.ts`), and sharp 0.35.5 in `bun.lock` as an optional dependency of Astro. The font is `@fontsource-variable/schibsted-grotesk`: variable WOFF2 files only.

## TL;DR

The statistics page needs no chart library, and the share picture needs at most one new package.

- **Charts**: hand-written SVG and HTML in Astro components is the only option with **0 kB** of script, no DOM on the server, and the theme tokens as they are. The libraries cost from 7.7 kB (Charts.css, CSS only) to 368 kB gzip (ECharts, full).
- **Accessible charts**: W3C asks for a short name plus a long description, and "where possible" the data in a table. Bars and lines need **3:1** against what is next to them. Colour must not be the only cue.
- **Share picture**: `@resvg/resvg-js` 2.6.2 is already in the repo and has musl builds for x64 and arm64. It drew a 1200×630 picture in **30 ms** and a 1080×1920 one in **45 ms**. It did not load the app's variable WOFF2 font, and it painted `var()` and `light-dark()` colours black. `satori` 0.63.2 (one new package) solves fonts and text wrapping.
- **Sharing**: `navigator.share({ files })` works on Safari iOS 14+ and Chrome Android 76+, not on Firefox. It needs HTTPS and a tap. The Bluesky compose link takes text only. A Bluesky image is at most **2,000,000 bytes**.
- **Post to Bluesky from the server**: no new package. Two more scopes: `repo:app.bsky.feed.post?action=create` and `blob:image/*`. `bsky.social` accepted them in a live PAR request. Each reader who wants this signs in again.

## A. Charts

**Answer: no option wins on every line. Hand-written SVG wins on the rules of this project (no script, offline, few dependencies, tokens). A library wins only if the page later needs data-point exploration with the keyboard, zoom, or many more chart types.**

The six charts are small: 12 months, a year of days, about 10 ranked rows.

### The options

| # | Option | Version, release | Size (min, gzip) | Renders on the server with no DOM | Licence |
|---|---|---|---|---|---|
| 1 | Hand-written SVG or HTML + CSS in Astro components | — | 0 kB script | Yes: it is the page HTML | — |
| 2 | Chart.js | [4.6.1](https://www.npmjs.com/package/chart.js/v/4.6.1), 2026-10-22 | [204.7 kB, **69.6 kB**](https://bundlephobia.com/package/chart.js@4.6.1), whole package. [Tree-shakeable](https://www.chartjs.org/docs/latest/getting-started/integration.html#:~:text=Chart.js%20is%20tree%2Dshakeable) | No SVG. A PNG only, [with a canvas package](https://www.chartjs.org/docs/latest/getting-started/using-from-node-js.html#:~:text=with%20help%20from%20an%20NPM%20package%20such%20as%20node%2Dcanvas) | MIT |
| 3 | uPlot | [1.6.32](https://www.npmjs.com/package/uplot/v/1.6.32), 2025-03-14 | [50.8 kB, **21.9 kB**](https://bundlephobia.com/package/uplot@1.6.32) | No: it draws on [Canvas 2D](https://github.com/leeoniya/uPlot/blob/fcd049b2bde18f48cd0c8d1c2d41bb03db55b397/README.md?plain=1#L8) | MIT |
| 4 | Observable Plot | [0.6.19](https://www.npmjs.com/package/@observablehq/plot/v/0.6.19), 2026-11-05 | [381.5 kB, **126.9 kB**](https://bundlephobia.com/package/@observablehq/plot@0.6.19), with d3 | Yes, but it needs a DOM object: [JSDOM](https://observablehq.com/plot/getting-started#:~:text=Use%20JSDOM%20for%20a%20DOM%20implementation%20via%20the%20document%20option) or a virtual `Document` | ISC |
| 5a | Recharts | [3.11.0](https://www.npmjs.com/package/recharts/v/3.11.0), 2026-11-17 | [658.8 kB, **176.7 kB**](https://bundlephobia.com/package/recharts@3.11.0), 11 dependencies (Redux Toolkit, react-redux, immer) | React components that return SVG. With `preact/compat`: not verified | MIT |
| 5b | visx | [4.0.0](https://www.npmjs.com/package/@visx/shape/v/4.0.0), 2026-06-11 | `@visx/shape` [**10.7 kB**](https://bundlephobia.com/package/@visx/shape@4.0.0); `@visx/xychart` [**50.3 kB**](https://bundlephobia.com/package/@visx/xychart@4.0.0) | React components that return SVG. The README says it works with [`preact/compat`](https://github.com/airbnb/visx/blob/485c0359664ee8e612992defb16e1f035ed40b23/README.md?plain=1#L179-L182); it [needs React 18 or 19](https://github.com/airbnb/visx/blob/485c0359664ee8e612992defb16e1f035ed40b23/README.md?plain=1#L21) as a peer | MIT |
| 6 | Charts.css | [1.2.0](https://www.npmjs.com/package/charts.css/v/1.2.0), 2025-07-21 | [140.9 kB, **7.7 kB**](https://bundlephobia.com/package/charts.css@1.2.0) of CSS, no script. The README says [5.9 kB](https://github.com/ChartsCSS/charts.css/blob/b06dd4e756c49db44f9e0543ec2468dc65d70d96/README.md?plain=1#L13) | Yes: an HTML `<table>` with classes | MIT |
| 7 | Apache ECharts | [6.1.0](https://www.npmjs.com/package/echarts/v/6.1.0), 2026-05-19 | [1114.8 kB, **368.0 kB**](https://bundlephobia.com/package/echarts@6.1.0), whole package. [Tree-shakeable](https://echarts.apache.org/handbook/en/basics/import/#:~:text=substantially%20decrease%20bundle%20size%20by%20only%20importing%20as%20necessary) | **Yes**: `renderToSVGString()`, a [zero-dependency string renderer](https://echarts.apache.org/handbook/en/how-to/cross-platform/server/#:~:text=zero%2Ddependency%20server%2Dside%20string%20based%20SVG%20rendering%20solution) since 5.3.0 | Apache-2.0 |
| 8 | Frappe Charts | `latest` is [1.6.2](https://www.npmjs.com/package/frappe-charts/v/1.6.2), published 2021-06-16. `next` is 2.0.0-rc31, 2026-10-19 | [67.5 kB, **19.8 kB**](https://bundlephobia.com/package/frappe-charts@1.6.2) | Not documented. The constructor takes a selector or a DOM element ([README](https://github.com/frappe/charts/blob/7b15424c3af80b1c8e178d8e612c290d2d630904/README.md)) | MIT |
| 9 | A Preact-native chart library | None found | — | — | — |

- Option 9: `npm search "preact chart"` gave no chart library in its first 20 results. `preact-chartjs-2` 1.0.3 was last published on 2017-10-05. Preact itself is [5.0 kB gzip](https://bundlephobia.com/package/preact@11.2.0), so options 5a and 5b add their own weight on top of the island runtime the app already ships.

### Theme, accessibility, touch

| # | Light and dark from CSS custom properties | Accessibility in the library | Touch |
|---|---|---|---|
| 1 | Yes. Inline SVG reads `var(--token)` and `currentColor`; `src/components/Mark.astro` does it today | All ours to write: name, description, table (section B) | Links, buttons and `<details>`; nothing needs hover |
| 2 | No. Colours are [script options](https://www.chartjs.org/docs/latest/general/colors.html) on a canvas. The island must read the tokens and draw again when the theme changes | [None in the canvas](https://www.chartjs.org/docs/latest/general/accessibility.html#:~:text=the%20canvas%20content%20will%20not%20be%20accessible%20to%20screen%20readers). The page adds `role="img"`, `aria-label` or fallback content | Listens to `touchstart` and `touchmove` [by default](https://www.chartjs.org/docs/latest/configuration/interactions.html#:~:text=The%20events%20option%20defines%20the%20browser%20events%20that%20the%20chart%20should%20listen%20to) |
| 3 | Not documented in the README (canvas) | Nothing in the README | [No built-in panning](https://github.com/leeoniya/uPlot/blob/fcd049b2bde18f48cd0c8d1c2d41bb03db55b397/README.md?plain=1#L49); touch zoom is a demo plugin |
| 4 | Partly. [Marks and axes default to `currentColor`](https://observablehq.com/plot/features/plots#:~:text=marks%20and%20axes%20default%20to%20currentColor). `var()` as a fill: not verified | [ARIA labels](https://observablehq.com/plot/features/accessibility#:~:text=Plot%20uses%20ARIA%20to%20make%20plots%20more%20accessible): `ariaLabel` and `ariaDescription` on the SVG, `aria-label` on marks. That page names no keyboard support and no data table | Pointer and tip marks. [No partial re-render](https://observablehq.com/plot/features/interactions#:~:text=Plot%20does%20not%20currently%20provide%20incremental%20re%2Drendering) |
| 5a | Props per chart. `var()` in props: not verified | The best of the list. `accessibilityLayer` is [on by default since 3.0](https://github.com/recharts/recharts/wiki/Recharts-and-accessibility#:~:text=This%20is%20false%20by%20default%20in%202.x%2C%20and%20true%20by%20default%20in%203.0%20and%20later): ARIA labels, roles, arrow keys between points. VoiceOver users [must turn QuickNav off](https://github.com/recharts/recharts/wiki/Recharts-and-accessibility#:~:text=you%20will%20need%20to%20turn%20QuickNav%20off) | Not verified |
| 5b | Ours: visx gives shapes, we write the SVG props | Nothing in the README | Ours to write |
| 6 | Yes: [`--color` variables](https://chartscss.org/components/colors/#:~:text=The%20color%20system%20can%20be%20customized%20by%20changing%20the%20value%20of%20the%20%2D%2Dcolor%20or%20%2D%2Dcolor%2D%2A%20variables) | The data is a real table: ["visible to search engines and screen readers"](https://chartscss.org/docs/#:~:text=The%20raw%20data%20is%20part%20of%20the%20HTML%2C%20making%20it%20visible%20to%20search%20engines%20and%20screen%20readers). Whether the table semantics survive its `display` rules in each browser: not verified | Tooltips show [on hover](https://chartscss.org/components/tooltips/#:~:text=when%20hovering%20over%20the%20data) only |
| 7 | No. Themes are script objects; version 6 adds [theme switching at run time](https://echarts.apache.org/handbook/en/basics/release-note/v6-feature/#:~:text=Dynamic%20Theme%20Switching) | A written description in `aria-label`, [off by default](https://echarts.apache.org/handbook/en/best-practices/aria/#:~:text=This%20accessibility%20function%20is%20turned%20off%20by%20default), and [decal patterns](https://echarts.apache.org/handbook/en/best-practices/aria/#:~:text=supports%20decal%20patterns) beside colour | Not verified |
| 8 | Colours are a script option (`colors: [...]` in the README) | Nothing in the README | Not verified |

### Chart types

| Chart | 1 Hand-written | 3 uPlot | 4 Plot | 6 Charts.css | 8 Frappe |
|---|---|---|---|---|---|
| Bars by month | `<rect>` per month | Yes | Yes | Yes (column) | Yes |
| Stacked bars | Stacked `<rect>` | Not verified | Yes (stack transform) | Yes | Not verified |
| Donut or proportion bar | One flex row, or `<circle>` strokes | No pie in the README | No pie or arc mark in the [mark list](https://observablehq.com/plot/features/marks); a stacked bar works | Pie [released](https://chartscss.org/charts/) | Pie and percentage ([README](https://github.com/frappe/charts/blob/7b15424c3af80b1c8e178d8e612c290d2d630904/README.md?plain=1#L33)) |
| Calendar heatmap | 53 × 7 `<rect>` | No | Yes (cell mark) | No | Yes |
| Cumulative line or area | One `<path>` | Yes | Yes | Yes | Yes |
| Ranked horizontal bars | A list with CSS widths | Not verified | Yes | Yes (bar) | Not verified |

Chart.js, Recharts, visx and ECharts cover all six; they are left out of this table.

### Recommendation matrix

| If this matters most | Pick | Cost |
|---|---|---|
| Works with no script, offline with the page HTML, no new dependency, tokens as they are, one drawing for the page and the share picture | **1 Hand-written** | We write the scales (a few lines per chart) and all of section B |
| Bars, columns and lines fast, with the table for free | **6 Charts.css** | 7.7 kB CSS, a second colour system beside `theme.css`, no heatmap, hover-only tooltips, radial types still "under development" |
| Arrow-key travel between data points and spoken tooltips, ready made | **5a Recharts** | 176.7 kB gzip in an island, React peer packages through `preact/compat` (not verified), no chart without script |
| A library that draws SVG on the server, many chart types later | **7 ECharts with `ssr: true`** (0 kB sent to the phone) | A 60 MB package on the server; colours as script themes, so the server must know the theme; its [client runtime](https://echarts.apache.org/handbook/en/how-to/cross-platform/server/#:~:text=Lightweight%20Client%20Runtime) is needed for any interaction |
| Grammar-of-graphics charts on the server | **4 Plot** | 126.9 kB if sent to the phone; on the server it needs JSDOM or a virtual `Document`; ["only practical for simple plots of small data"](https://observablehq.com/plot/getting-started#:~:text=Server%2Dside%20rendering%20is%20only%20practical%20for%20simple%20plots%20of%20small%20data) |
| Thousands of points with zoom | **3 uPlot** | Canvas only; no donut, no heatmap. Not this page |
| A quick canvas chart | **2 Chart.js**, **8 Frappe** | Script only, canvas or DOM only, no built-in accessibility. Frappe's `latest` version on npm dates from 2021 |

What this means for Atomes:

- Option 1 is the only one that meets all four project rules at once. A chart function that returns an SVG string serves the Astro page (tokens through `var()`) and the share picture (the same string with hex colours, section C).
- Filters can be a `GET` form: the server draws the charts again. No island is needed for the first version.
- A year heatmap is 53 columns. On a 390 px screen that is about 6 px per day. A day cannot be a tap target there (section B). Show months as rows, or let the strip scroll.

## B. Accessible charts

**Answer: give each chart a short name, a text summary, and the data as a table that everyone can open. Do not rely on colour alone. Keep 3:1 for the shapes that carry the data.**

What W3C says:

- A chart is a complex image: ["a two-part text alternative is required"](https://www.w3.org/WAI/tutorials/images/complex/#:~:text=a%20two%2Dpart%20text%20alternative%20is%20required), a short description and a long one (WAI tutorial, Complex Images).
- The long description should be visible: ["Make long descriptions available to everyone"](https://www.w3.org/WAI/tutorials/images/complex/#:~:text=Make%20long%20descriptions%20available%20to%20everyone).
- The tutorial's approach 3 puts the image and its long description, with a table, in one `<figure>`: ["Structurally associating the image and its adjacent long description"](https://www.w3.org/WAI/tutorials/images/complex/#:~:text=Structurally%20associating%20the%20image%20and%20its%20adjacent%20long%20description).
- `aria-describedby` flattens its target to plain text: ["this approach only works for long descriptions that are text-only"](https://www.w3.org/WAI/tutorials/images/complex/#:~:text=this%20approach%20only%20works%20for%20long%20descriptions%20that%20are%20text%2Donly). So a table must not be the `aria-describedby` target.
- WCAG 2.2 SC 1.1.1, the data chart example: ["Where possible and practical, the actual data is provided in a table."](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html#:~:text=Where%20possible%20and%20practical%2C%20the%20actual%20data%20is%20provided%20in%20a%20table.) Technique [G92](https://www.w3.org/WAI/WCAG22/Techniques/general/G92) shows a long description of a sales chart. The table itself follows the [WAI tables tutorial](https://www.w3.org/WAI/tutorials/tables/) (caption, header cells).
- ARIA 1.2 `img` role: ["authors MUST provide a label using the aria-label or aria-labelledby attribute"](https://www.w3.org/TR/wai-aria-1.2/#img#:~:text=authors%20MUST%20provide%20a%20label%20using%20the%20aria%2Dlabel%20or%20aria%2Dlabelledby%20attribute). The role has "Children Presentational: True" ([`img`](https://www.w3.org/TR/wai-aria-1.2/#img)). So text drawn inside the SVG (axis labels, values) is not read. The name, the summary and the table must carry it.
- The WAI-ARIA Graphics Module adds `graphics-document`, for content where ["the visual appearance or layout of content conveys meaning"](https://www.w3.org/TR/graphics-aria-1.0/#graphics-document#:~:text=the%20visual%20appearance%20or%20layout%20of%20content%20conveys%20meaning). It suits a chart whose parts are read one by one. Screen reader support: not verified.
- SC 1.4.1 Use of Color: ["Color is not used as the only visual means of conveying information"](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html#:~:text=Color%20is%20not%20used%20as%20the%20only%20visual%20means%20of%20conveying%20information). Failure F13 names charts: ["a chart that conveys information by color"](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html#:~:text=having%20a%20chart%20that%20conveys%20information%20by%20color) with no other cue.
- Technique G111, colour and pattern: ["patterns are included to convey the same information in a manner that does not depend on color"](https://www.w3.org/WAI/WCAG22/Techniques/general/G111#:~:text=patterns%20are%20included%20to%20convey%20the%20same%20information%20in%20a%20manner%20that%20does%20not%20depend%20on%20color). A text label on each segment does the same job.
- SC 1.4.11 Non-text Contrast: ["contrast ratio of at least 3:1 against adjacent color(s)"](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html#:~:text=contrast%20ratio%20of%20at%20least%203%3A1%20against%20adjacent%20color%28s%29) for ["Parts of graphics required to understand the content"](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html#:~:text=Parts%20of%20graphics%20required%20to%20understand%20the%20content). A graphical object is, for example, ["each line in a graph"](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html#:~:text=the%20important%20parts%20of%20a%20more%20complex%20diagram%20such%20as%20each%20line%20in%20a%20graph) or [each slice of a pie](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html#:~:text=The%20graphical%20objects%20are%20the%20slices%20of%20the%20pie%20%28chart%29).
- The same page gives the way out: the shape need not meet 3:1 when ["a graphic with text embedded or overlaid conveys the same information, such as labels and values on a chart"](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html#:~:text=A%20graphic%20with%20text%20embedded%20or%20overlaid%20conveys%20the%20same%20information%2C%20such%20as%20labels%20and%20values%20on%20a%20chart).
- Technique G209, for segments that touch: ["add a border with at least a 3:1 color contrast with each color"](https://www.w3.org/WAI/WCAG22/Techniques/general/G209#:~:text=add%20a%20border%20with%20at%20least%20a%203%3A1%20color%20contrast%20with%20each%20color).
- If a tap or a focus opens a value bubble, SC 1.4.13 applies: ["A mechanism is available to dismiss the additional content"](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html#:~:text=A%20mechanism%20is%20available%20to%20dismiss%20the%20additional%20content). A bar that can be tapped is a target of SC 2.5.8: ["at least 24 by 24 CSS pixels"](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html#:~:text=at%20least%2024%20by%2024%20CSS%20pixels), or spaced.

Pattern for Atomes (a proposal built from the points above, not a quote):

```html
<figure>
  <figcaption id="c1">Volumes read by month, 2026</figcaption>
  <svg role="img" aria-labelledby="c1" aria-describedby="c1-sum">…</svg>
  <p id="c1-sum">142 volumes. The best month is July, with 23.</p>
  <details>
    <summary>Show the numbers</summary>
    <table>…</table>
  </details>
</figure>
```

- Every string comes from `t(key)` (ADR 0015), the sentences included.
- Stacked bars and the proportion bar: a label or a value on each segment, and a gap in the ground colour between segments.
- Heatmap: the lightest step is hard to hold at 3:1 against the ground in both themes. Draw a 3:1 outline on each cell, or rely on the table and say so in the summary.
- `src/styles/theme.test.ts` already checks the contrast of each colour token in light, dark and high contrast. Chart colours should be tokens, so the same test covers them.

## C. The share picture on the server

**Answer: the shortest path is an SVG string turned into a PNG by `@resvg/resvg-js`, which the repo already has. It works on Alpine. Its limits are fonts (TTF or OTF files only in our check) and text layout. `satori` removes both limits for one new package.**

### The paths

| Path | Packages | Fonts | Layout and CSS | Alpine, x64 and arm64 | Measured here |
|---|---|---|---|---|---|
| 1. SVG string → `@resvg/resvg-js` | [2.6.2](https://www.npmjs.com/package/@resvg/resvg-js/v/2.6.2), 2024-03-26, MPL-2.0. In the repo as a devDependency. `next` is 2.7.0-alpha.2 (2026-01-28) | Files by path: [`fontFiles`, `loadSystemFonts: false`](https://github.com/thx/resvg-js/blob/9de8ddd9dd62293006d849dd846a3b91ba992f23/index.d.ts#L5-L6). The app's variable WOFF2 did **not** load (check 1). WOFF2 loading is announced [for the Wasm build](https://github.com/thx/resvg-js/blob/9de8ddd9dd62293006d849dd846a3b91ba992f23/CHANGELOG.md?plain=1#L183) only | Ours: SVG has no text wrapping. `var()` and `light-dark()` are painted **black** (check 2) | Yes: [`linux-x64-musl` and `linux-arm64-musl`](https://github.com/thx/resvg-js/blob/9de8ddd9dd62293006d849dd846a3b91ba992f23/README.md?plain=1#L229-L232) builds, both in `bun.lock`. [No node-gyp, no postinstall](https://github.com/thx/resvg-js/blob/9de8ddd9dd62293006d849dd846a3b91ba992f23/README.md?plain=1#L26) | 1200×630: 30 ms. 1080×1920: 45 ms. PNG 64 to 71 kB |
| 2. `satori` → `@resvg/resvg-js` | satori [0.63.2](https://www.npmjs.com/package/satori/v/0.63.2), 2026-10-20, MPL-2.0, 12 dependencies, JavaScript and Wasm, [Node 16+](https://github.com/vercel/satori/blob/074f0b38ed0f5d8fa768f709c0bb072b2d6c99e1/README.md?plain=1#L665) | [TTF, OTF, WOFF, WOFF2](https://github.com/vercel/satori/blob/074f0b38ed0f5d8fa768f709c0bb072b2d6c99e1/README.md?plain=1#L577) as buffers; a font is required. A variable font gives its default weight only. Text becomes [`<path>`](https://github.com/vercel/satori/blob/074f0b38ed0f5d8fa768f709c0bb072b2d6c99e1/README.md?plain=1#L691), so resvg needs no font | [Flexbox, grid and block](https://github.com/vercel/satori/blob/074f0b38ed0f5d8fa768f709c0bb072b2d6c99e1/README.md?plain=1#L184), text wrapping, `<style>` sheets. [`light-dark()` gives the light colour](https://github.com/vercel/satori/blob/074f0b38ed0f5d8fa768f709c0bb072b2d6c99e1/README.md?plain=1#L235). [No `@font-face`, no `@import`](https://github.com/vercel/satori/blob/074f0b38ed0f5d8fa768f709c0bb072b2d6c99e1/README.md?plain=1#L530) | satori has no native part. resvg as in path 1 | Not measured: satori is not installed |
| 3. `satori` → `sharp` | sharp [0.35.5](https://www.npmjs.com/package/sharp/v/0.35.5), 2026-09-27, Apache-2.0. In `bun.lock` through Astro (`optionalDependencies`) | As path 2 | As path 2. This is the pair in the [satori README](https://github.com/vercel/satori/blob/074f0b38ed0f5d8fa768f709c0bb072b2d6c99e1/README.md?plain=1#L43) and in the Astro docs | Yes: [musl 1.2.5+ on x64](https://sharp.pixelplumbing.com/install/#:~:text=Linux%20x64%20%28glibc%20%3E%3D%202.28%2C%20musl%20%3E%3D%201.2.5%2C%20CPU%20with%20SSE4.2%29) and [arm64](https://sharp.pixelplumbing.com/install/#:~:text=Linux%20ARM64%20%28glibc%20%3E%3D%202.28%2C%20musl%20%3E%3D%201.2.5%29); [Node 20.9+](https://sharp.pixelplumbing.com/install/#:~:text=Node%2DAPI%20v9%20compatible%20runtime%20e.g.%20Node.js%20%3E%3D%2020.9.0) | sharp alone: see path 4 |
| 4. SVG string → `sharp` | sharp only: no new package | [fontconfig finds fonts](https://sharp.pixelplumbing.com/install/#:~:text=fontconfig%20is%20used%20to%20find%20the%20relevant%20fonts), so the font must be installed in the image. With no configuration: ["Fontconfig error: Cannot load default config file"](https://sharp.pixelplumbing.com/install/#:~:text=Fontconfig%20error%3A%20Cannot%20load%20default%20config%20file). ["Embedded SVG fonts are unsupported."](https://sharp.pixelplumbing.com/install/#:~:text=Embedded%20SVG%20fonts%20are%20unsupported) | Ours. A `var()` set in a `<style>` block is ignored; `light-dark()` is black (check 2). On macOS a missing family fell back to another font with no error | Binaries: yes. Fonts in the Alpine image: not verified | 1200×630: 16 to 38 ms. 1080×1920: 20 ms. PNG 75 to 102 kB |
| 5. `@vercel/og` | [1.0.3](https://www.npmjs.com/package/@vercel/og/v/1.0.3), 2026-09-22, MPL-2.0, Node 22+. It pins satori **0.33.5** and `@resvg/resvg-wasm` 2.4.1 | ["Only ttf, otf, and woff"](https://vercel.com/docs/og-image-generation#:~:text=Only%20ttf%2C%20otf%2C%20and%20woff%20font%20formats%20are%20supported) | Flexbox only in that satori; a [500 KB bundle limit](https://vercel.com/docs/og-image-generation#:~:text=Maximum%20bundle%20size%20of%20500KB) on Vercel | Wasm, so yes. Slower: resvg says Wasm in Node ["is slower"](https://github.com/thx/resvg-js/blob/9de8ddd9dd62293006d849dd846a3b91ba992f23/README.md?plain=1#L195) | Not measured |
| 6. In the browser: SVG → `<canvas>` → `toBlob` | None | Fonts must be inside the SVG as `data:` URLs | The browser's own | — | Not measured |

### Notes on each path

- **satori input.** It takes JSX, or [plain objects](https://github.com/vercel/satori/blob/074f0b38ed0f5d8fa768f709c0bb072b2d6c99e1/README.md?plain=1#L83) with `type` and `props`. No React is needed. Preact elements as input: not verified.
- **satori and our fonts.** The variable WOFF2 would render every text at weight 400. Bold text needs static files. `@fontsource/schibsted-grotesk` 5.3.0 (OFL-1.1) has [static `woff` and `woff2` files per weight](https://unpkg.com/browse/@fontsource/schibsted-grotesk@5.3.0/files/), and no TTF. So: satori reads them; resvg alone (path 1) needs TTF or OTF files from another source.
- **`@vercel/og` outside Vercel.** The docs say it [runs on the Node.js runtime](https://vercel.com/docs/og-image-generation#:~:text=Vercel%20OG%20image%20generation%20is%20supported%20on%20the%20Node.js%20runtime), and it ["uses Satori and Resvg"](https://vercel.com/docs/og-image-generation#:~:text=%40vercel%2Fog%20uses%20Satori%20and%20Resvg%20to%20convert%20HTML%20and%20CSS%20into%20PNG). Its `ImageResponse` wants a React element and defaults to 1200×630 ([npm README](https://www.npmjs.com/package/@vercel/og)). It gives nothing that paths 2 or 3 lack, and an older satori.
- **Astro's guidance.** The Fonts guide has the only official example: font data ["such as generating OpenGraph images with Satori in an API Route"](https://docs.astro.build/en/guides/fonts/#:~:text=such%20as%20generating%20OpenGraph%20images%20with%20Satori%20in%20an%20API%20Route). It uses `satori`, `satori-html` (0.3.2, last published 2022-12-12) and `sharp`, with `fontData` and `experimental_getFontFileURL` from `astro:assets`. That needs fonts set up with Astro's Fonts API; the app imports a fontsource package instead. The docs have no recipe for share pictures ([recipe list](https://github.com/withastro/docs/tree/main/src/content/docs/en/recipes)).
- **Astro 7.** The upgrade guide has no entry on Open Graph images, satori or sharp; its main change is [Vite 8](https://docs.astro.build/en/guides/upgrade-to/v7/#:~:text=Astro%20v7.0%20upgrades%20to%20Vite%208). [Sharp stays the default image service](https://docs.astro.build/en/guides/images/#:~:text=Sharp%20is%20the%20default%20image%20service%20used%20for%20astro%3Aassets). An endpoint returns the PNG as a `Response` ([endpoints guide](https://docs.astro.build/en/guides/endpoints/#:~:text=to%20produce%20a%20binary%20.png%20image)).
- **Speed.** resvg's own benchmark gives [12 renders per second against 9 for sharp](https://github.com/thx/resvg-js/blob/9de8ddd9dd62293006d849dd846a3b91ba992f23/README.md?plain=1#L197-L210) on its test file. `render()` is synchronous and blocks the one server process (ADR 0007) for its 30 to 45 ms; `index.d.ts` also has `renderAsync`.
- **Covers in the picture.** resvg can [load images of `<image>` links](https://github.com/thx/resvg-js/blob/9de8ddd9dd62293006d849dd846a3b91ba992f23/index.d.ts) through `imagesToResolve()` and `resolveImage()`. satori takes an `<img>` with a `data:` URL or a buffer.
- **The browser path.** An SVG used as an image cannot load anything: ["External resources (e.g., images, stylesheets) cannot be loaded"](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image#:~:text=External%20resources%20%28e.g.%2C%20images%2C%20stylesheets%29%20cannot%20be%20loaded). A cross-origin image without CORS taints the canvas, and then `toBlob()` throws: ["any attempts to retrieve image data back from the canvas will cause an exception to be thrown"](https://developer.mozilla.org/en-US/docs/Web/HTML/How_to/CORS_enabled_image#:~:text=any%20attempts%20to%20retrieve%20image%20data%20back%20from%20the%20canvas%20will%20cause%20an%20exception%20to%20be%20thrown). Covers come from the app's own `/api/catalog`, so they would not taint. PNG is the one format every browser [must support](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob#:~:text=Browsers%20are%20required%20to%20support%20image%2Fpng) in `toBlob`.
- **WebKit.** [Bug 39059](https://bugs.webkit.org/show_bug.cgi?id=39059), "canvas drawImage does not render SVG with embedded images correctly", is still NEW (opened 2010, last change 2026-04-01). [Bug 219770](https://bugs.webkit.org/show_bug.cgi?id=219770), "SVG with embedded font triggers img.onload before font is available", is still NEW; its reporter wrote on 2026-08-11 that Safari 26.5.2 draws the test correctly. [Bug 180301](https://bugs.webkit.org/show_bug.cgi?id=180301) (a `<foreignObject>` tainted the canvas) is fixed. The browser path is the one with the most surprises on iPhone.

### Recommendation matrix

| If this matters most | Pick | Why |
|---|---|---|
| Fewest packages, charts are already SVG strings, labels are short | **Path 1** | Nothing new: move `@resvg/resvg-js` to `dependencies`, add two static font files |
| Titles of Works and names that wrap, flex layout, the fontsource files | **Path 2** | One new package; text becomes paths, so no font set-up for resvg |
| No native package beyond what Astro brings | **Path 3 or 4** | sharp is in the lockfile; path 4 needs fonts installed in the Alpine image |
| No server work at all | **Path 6** | Script only; fonts inlined; WebKit bugs; the picture cannot serve `og:image` or a server post |

Constraints for any server path:

- **Colours.** Resolve every colour to hex on the server, for the theme the reader picked. `scripts/icons.ts` already reads the `light-dark()` pairs from `theme.css` (`iconPalettes`).
- **Production install.** `@resvg/resvg-js` is a devDependency today; the image installs with `--production` (`Dockerfile`, line 20). It must move to `dependencies`. Whether the Astro 7 build keeps the native `.node` file out of the bundle: not verified; the CI `image` job would show it.
- **One process.** Keep the render short or use `renderAsync`; cache the PNG per reader, filter and theme.

## D. Sharing from the browser

**Answer: offer the system share sheet where `navigator.canShare({ files })` is true, and always a download link. The Bluesky compose link cannot carry a picture.**

### Web Share with files

- Call `navigator.canShare({ files })` first: it ["returns true if the equivalent call to navigator.share() would succeed"](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/canShare#:~:text=returns%20true%20if%20the%20equivalent%20call%20to%20navigator.share%28%29%20would%20succeed). MDN: ["you should always test with navigator.canShare()"](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share#:~:text=you%20should%20always%20test%20with%20navigator.canShare%28%29). PNG is in its list of [shareable file types](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share#shareable_file_types).
- HTTPS: ["available only in secure contexts (HTTPS)"](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share#:~:text=This%20feature%20is%20available%20only%20in%20secure%20contexts%20%28HTTPS%29).
- A tap: `share()` fails with `NotAllowedError` when ["the window does not have transient activation"](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share#:~:text=the%20window%20does%20not%20have%20transient%20activation). And ["Transient activation expires after a timeout"](https://developer.mozilla.org/en-US/docs/Glossary/Transient_activation#:~:text=Transient%20activation%20expires%20after%20a%20timeout). So fetch the PNG before the tap, not after it. The length of the timeout per browser: not verified.
- No file sharing gives a `TypeError`: ["Files are specified but the implementation does not support file sharing"](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share#:~:text=Files%20are%20specified%20but%20the%20implementation%20does%20not%20support%20file%20sharing).

Support, from MDN browser-compat-data at [`9237d95`](https://github.com/mdn/browser-compat-data/blob/9237d95b44e0ed02a094c50a0277e228c81b236f/api/Navigator.json) (`share`, then `share.data_files_parameter`); [caniuse](https://caniuse.com/web-share) agrees on the first column, with Edge full at 95 where MDN says 93:

| Browser | `share()` | With `files` |
|---|---|---|
| Safari on iOS | 12.2 | **14** |
| Chrome on Android | 61 | **76** |
| Samsung Internet | 8.2 | 11.0 |
| Firefox on Android | 79 | **No** |
| Safari on macOS | 12.1 | 14 |
| Chrome on desktop | 89 on Windows and ChromeOS; 128 everywhere | 89 |
| Edge | 81 on Windows; 93 everywhere | 81 |
| Firefox on desktop | No (behind a flag) | No |
| Android WebView | No | No |

Fallbacks:

- **Download link.** `<a href="/…/statistics.png" download>` works with no script when the server makes the PNG: ["download only works for same-origin URLs, same-origin blob:, and data: schemes"](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a#:~:text=download%20only%20works%20for%20same%2Dorigin%20URLs%2C%20same%2Dorigin%20blob%3A%2C%20and%20data%3A%20schemes).
- **Copy.** `navigator.clipboard.write()` with a PNG: ["Browsers commonly support writing text, HTML, and PNG image data"](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/write#:~:text=Browsers%20commonly%20support%20writing%20text%2C%20HTML%2C%20and%20PNG%20image%20data). Copying a link only helps if the statistics have a public page, which Atomes does not have today (Private by default).

### Picture sizes

| Use | Size | Source |
|---|---|---|
| Link card (`og:image`) | 1200×630 is the default of `@vercel/og` ([npm README](https://www.npmjs.com/package/@vercel/og)). The Open Graph protocol sets no size; it has `og:image:width`, `og:image:height`, and ["If the page specifies an og:image it should specify og:image:alt"](https://ogp.me/#:~:text=If%20the%20page%20specifies%20an%20og%3Aimage%20it%20should%20specify%20og%3Aimage%3Aalt) | [ogp.me](https://ogp.me/). Meta's own size advice: not verified |
| Instagram story 1080×1920, square 1080×1080 | Not verified: Meta's pages did not open | — |
| Bluesky image post | Up to 4 images. Each blob `image/*`, at most **2,000,000 bytes** ("May be up to 2 MB, formerly limited to 1 MB"). `alt` is required. `aspectRatio` is optional: `width` and `height`, integers from 1, "may be approximate" | [`images.json` L8–L34](https://github.com/bluesky-social/bsky/blob/cb6d2ce863352e26acdf35e660e365225e7edbae/lexicons/app/bsky/embed/images.json#L8-L34), [`defs.json`](https://github.com/bluesky-social/bsky/blob/cb6d2ce863352e26acdf35e660e365225e7edbae/lexicons/app/bsky/embed/defs.json#L5-L12) |
| Bluesky link card thumbnail | Blob `image/*`, at most 1,000,000 bytes | [`external.json` L23–L27](https://github.com/bluesky-social/bsky/blob/cb6d2ce863352e26acdf35e660e365225e7edbae/lexicons/app/bsky/embed/external.json#L23-L27) |

- The Bluesky posts guide still says ["Individual images are limited to 1,000,000 bytes in size"](https://bsky.network/docs/about-bluesky-content/posts#:~:text=Individual%20images%20are%20limited%20to%201%2C000%2C000%20bytes%20in%20size). The lexicon is the rule. Our pictures were 64 to 102 kB, far under both.
- On the ratio the guide says: ["it is best to leave the aspectRatio field undefined instead of guessing"](https://bsky.network/docs/about-bluesky-content/posts#:~:text=it%20is%20best%20to%20leave%20the%20aspectRatio%20field%20undefined%20instead%20of%20guessing). The server knows the size it drew, so it sets it.
- A Bluesky link card is not read from the page when the post is shown. The posting client reads `og:title`, `og:description` and `og:image` and stores them in the post: ["each client fetches and embeds this card metadata"](https://bsky.network/docs/about-bluesky-content/posts#:~:text=each%20client%20fetches%20and%20embeds%20this%20card%20metadata). So a card needs a public page with a public picture.
- `docs.bsky.app` now redirects to `bsky.network/docs`.

### Bluesky compose link

- ["The web URL endpoint is https://bsky.app/intent/compose, with the HTTP query parameter text"](https://bsky.network/docs/intent-links#:~:text=The%20web%20URL%20endpoint%20is%20https%3A%2F%2Fbsky.app%2Fintent%2Fcompose%2C%20with%20the%20HTTP%20query%20parameter%20text). The app link is `bluesky://intent/compose` with the same parameter. The text limit is 300 graphemes.
- ["Currently only the compose action URL endpoint is implemented."](https://bsky.network/docs/intent-links#:~:text=Currently%20only%20the%20compose%20action%20URL%20endpoint%20is%20implemented) There is no parameter for a picture.
- The reader still confirms: ["Following the link does not automatically result in the action"](https://bsky.network/docs/intent-links#:~:text=Following%20the%20link%20does%20not%20automatically%20result%20in%20the%20action).

### Ways to share, side by side

| Way | Picture goes with it | Needs | Where |
|---|---|---|---|
| System share sheet (`share({ files })`) | Yes, to any app on the device | Script, HTTPS, a tap, the PNG ready | Safari iOS 14+, Chrome Android 76+, desktop Chrome, Edge, Safari. Not Firefox |
| Download link | Yes, by hand | Nothing | Everywhere |
| Bluesky compose link | No: text only | Nothing | Everywhere |
| Post from the server (section E) | Yes, with alt text | A linked AT Protocol Account, two more scopes, a new sign-in | Everywhere |

## E. Posting to Bluesky from the server

**Answer: two XRPC calls with the session the server already holds, and no new package. The scope grows by `repo:app.bsky.feed.post?action=create` and `blob:image/*`. Do not use `transition:generic`.**

### The calls

1. `POST /xrpc/com.atproto.repo.uploadBlob`, body: the PNG bytes, `Content-Type: image/png`. The answer holds a `blob` object ([lexicon](https://github.com/bluesky-social/atproto/blob/07d1f6b6a9df99bbc4a51a7b585db178289512d5/lexicons/com/atproto/repo/uploadBlob.json)).
2. `POST /xrpc/com.atproto.repo.createRecord` with `collection: "app.bsky.feed.post"` and this record:

```json
{
  "$type": "app.bsky.feed.post",
  "text": "…",
  "createdAt": "2026-11-18T10:00:00.000Z",
  "langs": ["fr"],
  "embed": {
    "$type": "app.bsky.embed.images",
    "images": [
      {
        "image": { "$type": "blob", "ref": { "$link": "bafkrei…" }, "mimeType": "image/png", "size": 64053 },
        "alt": "…",
        "aspectRatio": { "width": 1200, "height": 630 }
      }
    ]
  }
}
```

- `image` is the `blob` object of call 1, as it came back. `text` and `createdAt` are required; `text` is at most 300 graphemes ([`post.json`](https://github.com/bluesky-social/bsky/blob/cb6d2ce863352e26acdf35e660e365225e7edbae/lexicons/app/bsky/feed/post.json#L16)).
- The alt text is the place for the summary sentence of section B.
- The server checks the blob against the lexicon at call 2, not at call 1: it ["can only apply generic blob limits and restrictions at initial upload time"](https://atproto.com/specs/blob#:~:text=can%20only%20apply%20generic%20blob%20limits%20and%20restrictions%20at%20initial%20upload%20time). The reference PDS takes uploads up to [5 MB by default](https://github.com/bluesky-social/atproto/blob/07d1f6b6a9df99bbc4a51a7b585db178289512d5/packages/pds/src/config/config.ts#L41).
- A blob with no record is deleted after a while, ["with at least one hour a firm lower bound"](https://atproto.com/specs/blob#:~:text=with%20at%20least%20one%20hour%20a%20firm%20lower%20bound). If call 2 fails, nothing is left to clean.
- Strip metadata: ["strongly recommended best practice to strip image metadata before uploading"](https://bsky.network/docs/about-bluesky-content/posts#:~:text=strongly%20recommended%20best%20practice%20to%20strip%20image%20metadata%20before%20uploading). A PNG we draw has none.
- `@atproto/api` [0.32.2](https://www.npmjs.com/package/@atproto/api/v/0.32.2) (2026-11-17, MIT, Node 22+, 10.7 MB unpacked) wraps this: `new Agent(session)`, `agent.uploadBlob(data, opts)`, `agent.post(record)` ([oauth-client-node README L291–L317](https://github.com/bluesky-social/atproto/blob/07d1f6b6a9df99bbc4a51a7b585db178289512d5/packages/oauth/oauth-client-node/README.md?plain=1#L291-L317)). It is not needed: `src/lib/server/public-repo.ts` already calls XRPC with `session.fetchHandler`.
- `public-repo.ts` refuses every collection that is not Shared. The post needs its own small function beside it, not a wider `publicRepo`.

### The scope

- The reference PDS checks both calls for an OAuth session. Upload: [`permissions.assertBlob({ mime: encoding })`](https://github.com/bluesky-social/atproto/blob/07d1f6b6a9df99bbc4a51a7b585db178289512d5/packages/pds/src/api/com/atproto/repo/uploadBlob.ts#L12-L18), with the request's content type. Create: [`assertRepo({ action: 'create', collection })`](https://github.com/bluesky-social/atproto/blob/07d1f6b6a9df99bbc4a51a7b585db178289512d5/packages/pds/src/api/com/atproto/repo/createRecord.ts#L64-L69).
- `repo` can be ["limited to specific record types (collections) or actions"](https://atproto.com/specs/permission#:~:text=Can%20be%20limited%20to%20specific%20record%20types%20%28collections%29%20or%20actions). `blob` is the ["Ability to upload media files (blobs) to PDS"](https://atproto.com/specs/permission#:~:text=Ability%20to%20upload%20media%20files%20%28blobs%29%20to%20PDS), with MIME patterns such as `blob:*/*`.
- New scope string (156 characters):

  `atproto repo?collection=app.atomes.readingStatus&collection=app.atomes.label&collection=app.atomes.follow repo:app.bsky.feed.post?action=create blob:image/*`

- `blob:image/png` is narrower and enough if the picture is always a PNG.
- A blob permission cannot hide in a permission set: ["Permissions of this type can not be included in permission sets"](https://atproto.com/specs/permission#:~:text=Permissions%20of%20this%20type%20can%20not%20be%20included%20in%20permission%20sets). So it is always asked by name.
- Not `transition:generic`. It means ["broad PDS account permissions, equivalent to the previous"](https://atproto.com/specs/oauth#:~:text=broad%20PDS%20account%20permissions%2C%20equivalent%20to%20the%20previous) App Password: ["write (create/update/delete) any repository record type"](https://atproto.com/specs/oauth#:~:text=write%20%28create%2Fupdate%2Fdelete%29%20any%20repository%20record%20type), blobs, preferences, and calls to most services. And: ["The goal is to deprecate and eventually remove these transitional scopes."](https://atproto.com/specs/oauth#:~:text=The%20goal%20is%20to%20deprecate%20and%20eventually%20remove%20these%20transitional%20scopes)
- A session keeps the scope of its sign-in: ["OAuth session are strictly limited to the auth scopes in the initial grant"](https://atproto.com/specs/permission#:~:text=OAuth%20session%20are%20strictly%20limited%20to%20the%20auth%20scopes%20in%20the%20initial%20grant) (spike 0003, section 3). A reader who wants to post signs in again.
- The app can ask only those readers. The client metadata lists ["all scope values which might be requested by this client"](https://atproto.com/specs/oauth#:~:text=all%20scope%20values%20which%20might%20be%20requested%20by%20this%20client%20are%20declared%20here); each request ["must be a subset of the scopes declared in client metadata"](https://atproto.com/specs/oauth#:~:text=must%20be%20a%20subset%20of%20the%20scopes%20declared%20in%20client%20metadata). So: put the long string in the metadata, keep today's scope at sign-in, and ask for the long one when a reader turns on "Post to Bluesky".
- Check (Method): a loopback PAR request to `https://bsky.social` with the 156-character scope returned an authorize URL with a `request_uri`. So did `atproto repo:app.bsky.feed.post?action=create blob:image/png`. `bsky.social` still lists only `atproto` and `transition:*` in `scopes_supported`.

### What the reader sees

Read in the reference consent screen, [`scope-description.tsx`](https://github.com/bluesky-social/atproto/blob/07d1f6b6a9df99bbc4a51a7b585db178289512d5/packages/oauth/oauth-provider-ui/src/components/utils/scope-description.tsx) at `07d1f6b`:

| Scope asked | Cards on the consent screen |
|---|---|
| Today (`app.atomes.*` only) | "Repository — Publish changes", with a table: one row per collection, columns Create, Update, Delete ([L638–L656](https://github.com/bluesky-social/atproto/blob/07d1f6b6a9df99bbc4a51a7b585db178289512d5/packages/oauth/oauth-provider-ui/src/components/utils/scope-description.tsx#L638-L656)) |
| With the post and blob scopes | The same card, plus a row `app.bsky.feed.post` ticked under Create only, plus a row "Blob storage — Upload files" ([L754–L763](https://github.com/bluesky-social/atproto/blob/07d1f6b6a9df99bbc4a51a7b585db178289512d5/packages/oauth/oauth-provider-ui/src/components/utils/scope-description.tsx#L754-L763)). And a "Bluesky" card: "Access specific parts of your Bluesky account" ([L376–L397](https://github.com/bluesky-social/atproto/blob/07d1f6b6a9df99bbc4a51a7b585db178289512d5/packages/oauth/oauth-provider-ui/src/components/utils/scope-description.tsx#L376-L397)) |
| With `transition:generic` instead | "Bluesky — Manage your profile, posts, likes and follows as well as read your private preferences", "Repository — Create, update, and delete any public data linked to your account" and "Authenticate — Perform authenticated actions towards any service on your behalf" ([L618–L634](https://github.com/bluesky-social/atproto/blob/07d1f6b6a9df99bbc4a51a7b585db178289512d5/packages/oauth/oauth-provider-ui/src/components/utils/scope-description.tsx#L618-L634)) |

- The reader may grant less: ["The user might refine any granular requested scopes"](https://atproto.com/specs/oauth#:~:text=The%20user%20might%20refine%20any%20granular%20requested%20scopes). The server must read the granted scope, as `grantsSharing()` does in `src/lib/auth/client-config.ts`, before it shows "Post to Bluesky".
- `bsky.social` reports build `693d745` (`/xrpc/_health`). That commit is not public, so the screen of the hosted server is inferred from `main`, not seen.

## Risks and open questions

| # | Item | Impact | Next step |
|---|---|---|---|
| 1 | resvg did not load the variable WOFF2; `@fontsource` has no TTF | Path 1 draws no text without static TTF or OTF files | Choose: static font files in the repo (path 1), or satori with the fontsource `woff2` files (path 2) |
| 2 | `var()` and `light-dark()` turn black in resvg, with no error | A share picture with black shapes | The chart functions take a palette of hex colours; one test renders a picture and checks a pixel |
| 3 | `@resvg/resvg-js` is a devDependency; the Astro build may try to bundle the native file | The image starts and the share route fails | Move it to `dependencies`; check `bun run build` and the CI `image` job |
| 4 | `render()` blocks the one process for 30 to 45 ms (on a fast laptop; the server may be slower) | Other requests wait | `renderAsync`, and a cache per reader, filter and theme |
| 5 | Posting needs a wider scope and a new sign-in | Readers see a longer consent screen | Ask the wider scope only when a reader turns posting on; keep today's scope at sign-in |
| 6 | The consent screen of hosted PDSes is not seen live | The wording may differ | First check of the ticket: sign in with the test account over the Funnel and read the screen |
| 7 | A link card needs a public page and picture | Conflicts with "Private by default" | Owner decides whether shared statistics get a public page. Without it: picture posts only |
| 8 | The app's policy is `default-src 'self'` | The browser path (6) loads the SVG from a `blob:` or `data:` URL, which the policy may refuse | Only matters for path 6: test it, or add `img-src 'self' blob:` |
| 9 | A year heatmap is about 6 px per day at 390 px | Days cannot be tap targets | Month rows or a scrolling strip; values in the table |

## Not verified

- Recharts under `preact/compat` with Preact 11; Recharts server rendering (the source has an `initialDimension` prop on `ResponsiveContainer`; no doc page was opened: the site needs script).
- Touch behaviour of Recharts, ECharts and Frappe Charts.
- `var(--token)` as a colour in Observable Plot and Recharts.
- Whether Charts.css tables keep their table semantics for screen readers in each browser.
- Whether any Preact-native chart library exists beyond the first 20 results of one registry search.
- Screen reader support for the `graphics-document` role.
- satori render time, and satori with Preact elements: the package is not installed.
- sharp text rendering in the Alpine image (fontconfig, an installed font); the musl version of `node:22.23.4-alpine` against sharp's "musl >= 1.2.5".
- Whether the Astro 7 (Vite 8) server build leaves `@resvg/resvg-js` external.
- Where static TTF or OTF files of Schibsted Grotesk are published.
- Open Graph 1200×630 as Meta's advice, Instagram story 1080×1920 and square 1080×1080: `developers.facebook.com` and `help.instagram.com` returned empty pages.
- Whether the Bluesky app builds a link card from a URL in the compose link's `text`.
- Whether `default-src 'self'` lets a page load its own `blob:` image. The CSP text only says that for `*`, ["in order to allow a resource from a non-HTTP(S) scheme"](https://www.w3.org/TR/CSP3/#:~:text=in%20order%20to%20allow%20a%20resource%20from%20a%20non%2DHTTP%28S%29%20scheme) it must be listed.
- The timeout of transient activation per browser; Web Share with files inside the installed app on iOS.
- The consent screen and the write on a hosted PDS: no sign-in and no post were made.

## Method

- Versions, dates, dependencies, licences: `npm view <package>` (`version`, `time`, `dependencies`, `optionalDependencies`, `engines`, `license`).
- Sizes: `https://bundlephobia.com/api/size?package=<name>@<version>`.
- READMEs and code at pinned commits: satori `074f0b3`, resvg-js `9de8ddd`, uPlot `fcd049b`, visx `485c035`, Frappe Charts `7b15424`, Charts.css `b06dd4e`, atproto `07d1f6b`, bsky `cb6d2ce`, browser-compat-data `9237d95`.
- Pages: each linked page was downloaded and each quote was matched against its text by a script.
- Scratch checks (outside the repo, Node 26.13 on macOS arm64, with the packages already in `node_modules`; `@resvg/resvg-js` 2.6.2, sharp 0.35.5 with librsvg 2.63.2):
  1. Fonts: an SVG `<text>` with `fontFiles` set to `schibsted-grotesk-latin-wght-normal.woff2` and `loadSystemFonts: false` drew 0 dark pixels at weights 400 and 700. The same text with a system TTF drew 4,156. With one regular TTF, weight 700 drew the same pixels as 400: no synthetic bold.
  2. Colours, one 4×4 `<rect>` per case, first pixel read back. `var(--c)` from `:root` in a `<style>` block: resvg black, sharp kept the attribute colour. `light-dark(red, blue)`: black in both. `currentColor`, and a class in `<style>` with a hex colour: correct in both. A `prefers-color-scheme: dark` rule: not applied in either.
  3. Speed, median of 12 renders of an SVG with 12 bars, 371 heatmap cells and 8 lines of text. resvg: 30.5 ms (1200×630), 34.8 ms (1080×1080), 44.7 ms (1080×1920); PNG 64 to 71 kB. sharp: 16 to 38 ms (1200×630), 20.2 ms (1080×1920); PNG 75 and 102 kB.
  4. Loopback `NodeOAuthClient.authorize("https://bsky.social", { scope })` with `@atproto/oauth-client-node` 0.5.16 and the two scope strings of section E: a live PAR request that returned an authorize URL each time. Nobody signed in.
