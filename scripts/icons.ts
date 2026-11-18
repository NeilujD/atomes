// Makes every app icon under public/ from one drawing and the theme tokens
// (ui-direction: Environment badge, the mark). Run `bun scripts/icons.ts`
// after a change to the mark or to --ground, --ink, --accent or
// --alpha-shade-faint in src/styles/theme.css: it writes the SVG icons, then
// renders each PNG from its SVG with resvg. scripts/icons.test.ts fails while
// the files in public/ differ from what it would write.
import { readFileSync, writeFileSync } from 'node:fs';

export interface Palette {
  ground: string;
  ink: string;
  accent: string;
  // The empty slot: the "not owned" spine of the Series page (--shade-faint).
  faint: string;
}

// Staging, Preview and Local keep an orange ground: the icon lives on the home
// screen, outside the app, and must not look like production (the one
// exception to the ownership colours in ui-direction).
const stagingGround = '#f97316';

function token(css: string, name: string, pattern: string): RegExpExecArray {
  const found = new RegExp(`${name}:\\s*${pattern}`, 'i').exec(css);
  if (!found) throw new Error(`No ${name} in theme.css`);
  return found;
}

function pair(css: string, name: string): { light: string; dark: string } {
  const found = token(css, name, 'light-dark\\((#[0-9a-f]{6}),\\s*(#[0-9a-f]{6})\\)');
  return { light: found[1].toLowerCase(), dark: found[2].toLowerCase() };
}

// --shade-faint is ink at a share over transparent; the browser composites it
// on the ground in sRGB. An SVG icon needs the solid colour that results.
function over(ink: string, ground: string, share: number): string {
  const channel = (hex: string, at: number) => parseInt(hex.slice(at, at + 2), 16);
  return `#${[1, 3, 5]
    .map((at) => Math.round(channel(ink, at) * share + channel(ground, at) * (1 - share)))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`;
}

export function iconPalettes(css: string): Record<'light' | 'dark' | 'staging', Palette> {
  const ground = pair(css, '--ground');
  const ink = pair(css, '--ink');
  const accent = pair(css, '--accent');
  const share = Number(token(css, '--alpha-shade-faint', '(\\d+(?:\\.\\d+)?)%')[1]) / 100;
  const palette = (on: string, theme: 'light' | 'dark'): Palette => ({
    ground: on,
    ink: ink[theme],
    accent: accent[theme],
    faint: over(ink[theme], on, share),
  });
  return {
    light: palette(ground.light, 'light'),
    dark: palette(ground.dark, 'dark'),
    staging: palette(stagingGround, 'light'),
  };
}

// The mark of src/components/Mark.astro on a 1024 square: two ink spines, the
// faint spine of the empty slot, the cobalt spine. Flat: no glow, no outline.
// The spines stay inside the 40 % circle a maskable icon keeps.
const spines = [236, 388, 540, 692];
const spine = (x: number, fill: string) => `<rect x="${x}" y="252" width="96" height="520" rx="14" fill="${fill}"/>`;

function drawing(title: string, ground: string, rounded: boolean, fills: string[], style = ''): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">',
    `<title>${title}</title>${style}`,
    `<rect width="1024" height="1024"${rounded ? ' rx="224"' : ''} fill="${ground}"/>`,
    ...spines.map((x, at) => spine(x, fills[at])),
    '</svg>\n',
  ].join('');
}

function icon(title: string, palette: Palette, rounded: boolean): string {
  return drawing(title, palette.ground, rounded, [palette.ink, palette.ink, palette.faint, palette.accent]);
}

// The browser tab icon follows the system theme. resvg cannot, so the PNG
// favicons render from atomes-icon.svg (light).
function favicon(light: Palette, dark: Palette): string {
  const vars = (palette: Palette) =>
    `--bg:${palette.ground};--ink:${palette.ink};--fa:${palette.faint};--ac:${palette.accent}`;
  const style = `<style>:root{${vars(light)}}@media (prefers-color-scheme:dark){:root{${vars(dark)}}}</style>`;
  return drawing('Atomes', 'var(--bg)', true, ['var(--ink)', 'var(--ink)', 'var(--fa)', 'var(--ac)'], style);
}

export interface IconFile {
  // Relative to public/.
  path: string;
  svg: string;
}

export function iconSvgs(css: string): IconFile[] {
  const { light, dark, staging } = iconPalettes(css);
  return [
    { path: 'favicon.svg', svg: favicon(light, dark) },
    { path: 'favicon-staging.svg', svg: icon('Atomes staging', staging, true) },
    { path: 'icons/atomes-icon.svg', svg: icon('Atomes', light, true) },
    { path: 'icons/atomes-icon-dark.svg', svg: icon('Atomes', dark, true) },
    { path: 'icons/atomes-icon-maskable.svg', svg: icon('Atomes', light, false) },
    { path: 'icons/atomes-icon-maskable-dark.svg', svg: icon('Atomes', dark, false) },
    { path: 'icons/atomes-icon-staging.svg', svg: icon('Atomes staging', staging, true) },
    { path: 'icons/atomes-icon-staging-maskable.svg', svg: icon('Atomes staging', staging, false) },
  ];
}

// Each PNG and the SVG it renders from. The Apple touch icon is square: iOS
// rounds it itself and paints transparent corners black.
export const iconPngs: { path: string; from: string; size: number }[] = [
  { path: 'favicon-32.png', from: 'icons/atomes-icon.svg', size: 32 },
  { path: 'favicon-48.png', from: 'icons/atomes-icon.svg', size: 48 },
  { path: 'favicon-staging-32.png', from: 'icons/atomes-icon-staging.svg', size: 32 },
  { path: 'apple-touch-icon-180.png', from: 'icons/atomes-icon-maskable.svg', size: 180 },
  { path: 'apple-touch-icon-staging-180.png', from: 'icons/atomes-icon-staging-maskable.svg', size: 180 },
  ...[192, 512].flatMap((size) => [
    { path: `icons/atomes-icon-${size}.png`, from: 'icons/atomes-icon.svg', size },
    { path: `icons/atomes-icon-dark-${size}.png`, from: 'icons/atomes-icon-dark.svg', size },
    { path: `icons/atomes-icon-maskable-${size}.png`, from: 'icons/atomes-icon-maskable.svg', size },
    { path: `icons/atomes-icon-staging-${size}.png`, from: 'icons/atomes-icon-staging.svg', size },
    { path: `icons/atomes-icon-staging-maskable-${size}.png`, from: 'icons/atomes-icon-staging-maskable.svg', size },
  ]),
  { path: 'icons/atomes-icon-maskable-dark-512.png', from: 'icons/atomes-icon-maskable-dark.svg', size: 512 },
];

async function writeIcons(): Promise<void> {
  const { Resvg } = await import('@resvg/resvg-js');
  const publicDir = new URL('../public/', import.meta.url);
  const svgs = iconSvgs(readFileSync(new URL('../src/styles/theme.css', import.meta.url), 'utf8'));
  for (const { path, svg } of svgs) writeFileSync(new URL(path, publicDir), svg);
  for (const { path, from, size } of iconPngs) {
    const svg = readFileSync(new URL(from, publicDir), 'utf8');
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: size }, font: { loadSystemFonts: false } }).render();
    writeFileSync(new URL(path, publicDir), png.asPng());
  }
  console.log(`Wrote ${svgs.length} SVG and ${iconPngs.length} PNG icons in public/.`);
}

if (process.argv[1]?.endsWith('icons.ts')) await writeIcons();
