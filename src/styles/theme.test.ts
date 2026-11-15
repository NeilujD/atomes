import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The colours of an action must stay legible on the panel (WCAG AA, 4.5:1 for
// text) in light, dark and high contrast (ui-direction: colour roles). Read
// from theme.css, so a retuned colour that falls under the bar fails here.
const css = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');

type Rgb = [number, number, number];

function pair(name: string): { light: Rgb; dark: Rgb } {
  const found = new RegExp(`${name}:\\s*light-dark\\((#[0-9a-f]{6}),\\s*(#[0-9a-f]{6})\\)`, 'i').exec(css);
  if (!found) throw new Error(`No light-dark() pair for ${name} in theme.css`);
  return { light: hex(found[1]), dark: hex(found[2]) };
}

function hex(value: string): Rgb {
  return [1, 3, 5].map((at) => parseInt(value.slice(at, at + 2), 16) / 255) as Rgb;
}

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

// sRGB <-> OKLab (Björn Ottosson's matrices), for color-mix(in oklab, …).
function toOklab([r, g, b]: Rgb): Rgb {
  const [lr, lg, lb] = [r, g, b].map(linear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, a, b]: Rgb): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return rgb.map((c) => gamma(Math.min(1, Math.max(0, c)))) as Rgb;
}

// color-mix(in oklab, ink share, base): what `--contrast` does to a derived colour.
function mix(ink: Rgb, share: number, base: Rgb): Rgb {
  const [i, c] = [toOklab(ink), toOklab(base)];
  return fromOklab(i.map((value, at) => value * share + c[at] * (1 - share)) as Rgb);
}

function luminance(colour: Rgb): number {
  const [r, g, b] = colour.map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// `--contrast` is 0% by default, 45% in high contrast (theme.css).
const contrastSteps = [
  { name: 'normal', share: 0 },
  { name: 'high contrast', share: 0.45 },
];

describe('theme colours of actions', () => {
  const ink = pair('--ink');
  const surface = pair('--surface');
  const soft = pair('--soft');

  for (const theme of ['light', 'dark'] as const) {
    // The cobalt primary action: --accent on the panel, and on the hover fill.
    it(`the primary action (cobalt) reads at 4.5:1 or more on the panel, ${theme}`, () => {
      const accent = pair('--accent')[theme];
      expect(contrast(accent, surface[theme])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(accent, soft[theme])).toBeGreaterThanOrEqual(4.5);
    });

    for (const step of contrastSteps) {
      it(`an action that destroys (danger) reads at 4.5:1 or more on the panel, ${theme}, ${step.name}`, () => {
        const danger = mix(ink[theme], step.share, pair('--danger-base')[theme]);
        expect(contrast(danger, surface[theme])).toBeGreaterThanOrEqual(4.5);
        expect(contrast(danger, soft[theme])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
