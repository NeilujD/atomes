import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Sign in and the privacy notice take every value from theme.css (CORE-138),
// as the Shelf Check result screen does (theme.test.ts). Exempt: @media
// conditions, where CSS reads no variable.
const theme = readFileSync(new URL('../styles/theme.css', import.meta.url), 'utf8');

for (const page of ['sign-in.astro', 'privacy.astro']) {
  describe(`${page} uses theme tokens only`, () => {
    const source = readFileSync(new URL(`./${page}`, import.meta.url), 'utf8');
    const style = /<style>([\s\S]*?)<\/style>/.exec(source)?.[1] ?? '';
    const rules = style.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{/g, '{');

    it('has styles', () => {
      expect(rules.trim()).not.toBe('');
    });

    it('types no raw px, em, hex, rgb or alpha level', () => {
      const raw = [/\d+(?:\.\d+)?(?:px|em)\b/g, /#[0-9a-f]{3,8}\b/gi, /\b(?:rgba?|hsla?)\(/g, /color-mix\(/g, /opacity:\s*0?\.\d+/g].flatMap(
        (pattern) => rules.match(pattern) ?? [],
      );
      expect(raw).toEqual([]);
    });

    it('reads only variables that theme.css sets', () => {
      const set = new Set([...theme.matchAll(/(--[\w-]+):/g)].map((found) => found[1]));
      const read = [...rules.matchAll(/var\((--[\w-]+)/g)].map((found) => found[1]);
      expect(read.filter((name) => !set.has(name))).toEqual([]);
    });
  });
}
