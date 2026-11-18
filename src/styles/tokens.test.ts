import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The one look (ADR 0018): a screen takes every value from theme.css and types
// no raw px, em, hex, rgb, alpha level, duration or easing (ui-direction, "The
// one look"). Exempt: @media and @container conditions (CSS reads no variable
// there), the steps of a @keyframes (the drawing of a motion; its duration and
// easing are tokens), and px in a custom property a screen declares (one of
// its own sizes, named once).
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const theme = read('./theme.css');

// The CSS of a stylesheet, or of every <style> of an Astro file.
function styles(path: string): string {
  const source = read(path);
  if (!path.endsWith('.astro')) return source;
  return [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((found) => found[1]).join('\n');
}

// The values of `css` that are not tokens.
function rawValues(css: string): string[] {
  const rules = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
    .replace(/@(?:media|container)[^{]*\{/g, '{')
    .replace(/--[\w-]+:[^;{}]*;/g, (declaration) => declaration.replace(/\d+(?:\.\d+)?px\b/g, ''));
  return [
    /\d+(?:\.\d+)?(?:px|em)\b/g,
    /#[0-9a-f]{3,8}\b/gi,
    /\b(?:rgba?|hsla?)\(/g,
    /color-mix\([^;]*?\d+%/g,
    /opacity:\s*0?\.\d+/g,
    /\d+(?:\.\d+)?m?s\b/g,
    /cubic-bezier\(/g,
  ].flatMap((pattern) => rules.match(pattern) ?? []);
}

// Each checked file, and the files that set the variables it reads besides
// theme.css and itself: an island or a script sets one on an element; a
// screen sets the tone and cover width the glow reads (as the Shelf Check result).
const checked: Record<string, string[]> = {
  './shelf-check-result.css': [],
  './series.css': ['../islands/Series.tsx'],
  './glow.css': ['./shelf-check-result.css'],
  './selection.css': [],
  './charts.css': [],
  '../pages/sign-in.astro': [],
  '../pages/privacy.astro': [],
  '../pages/index.astro': [],
  '../pages/library.astro': ['../islands/LibraryCoverFlow.tsx', '../lib/cover.ts'],
  '../pages/to-buy.astro': [],
  '../pages/statistics.astro': [],
  '../pages/book.astro': [],
  '../pages/settings.astro': [],
  '../pages/check.astro': [],
  '../components/Mark.astro': [],
};

for (const [path, setters] of Object.entries(checked)) {
  describe(`${path.replace(/^.*\//, '')} uses theme tokens only`, () => {
    const css = styles(path);

    it('has styles', () => {
      expect(css.trim()).not.toBe('');
    });

    it('types no raw px, em, hex, rgb, alpha level, duration or easing', () => {
      expect(rawValues(css)).toEqual([]);
    });

    it('reads only variables that theme.css, the file or its setters set', () => {
      const set = new Set([theme, css, ...setters.map(read)].flatMap((source) => [...source.matchAll(/(--[\w-]+)(?=:|['"])/g)].map((found) => found[1])));
      const used = [...css.matchAll(/var\((--[\w-]+)/g)].map((found) => found[1]);
      expect(used.filter((name) => !set.has(name))).toEqual([]);
    });
  });
}
