import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The Series page takes every value from theme.css (CORE-126), as the Shelf
// Check result screen does (theme.test.ts). Exempt: @media conditions (CSS
// reads no variable there) and @keyframes steps, the drawing of a motion.
describe('the Series page uses theme tokens only', () => {
  const theme = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');
  const screen = readFileSync(new URL('./series.css', import.meta.url), 'utf8');
  // The island sets --spine-digits on the spine row.
  const island = readFileSync(new URL('../islands/Series.tsx', import.meta.url), 'utf8');
  const rules = screen
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
    .replace(/@media[^{]*\{/g, '{');

  it('types no raw px, em, hex, rgb, alpha level, duration or easing', () => {
    const raw = [
      /\d+(?:\.\d+)?(?:px|em)\b/g,
      /#[0-9a-f]{3,8}\b/gi,
      /\b(?:rgba?|hsla?)\(/g,
      /color-mix\([^;]*?\d+%/g,
      /opacity:\s*0?\.\d+/g,
      /\d+(?:\.\d+)?m?s\b/g,
      /cubic-bezier\(/g,
    ].flatMap((pattern) => rules.match(pattern) ?? []);
    expect(raw).toEqual([]);
  });

  it('reads only variables that theme.css, the page or its island sets', () => {
    const set = new Set([...`${theme}\n${screen}\n${island}`.matchAll(/(--[\w-]+):/g)].map((found) => found[1]));
    const read = [...screen.matchAll(/var\((--[\w-]+)/g)].map((found) => found[1]);
    expect(read.filter((name) => !set.has(name))).toEqual([]);
  });
});
