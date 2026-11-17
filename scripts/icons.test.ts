import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { iconPalettes, iconPngs, iconSvgs } from './icons';

// The tokens the icons read, as theme.css writes them (worked examples by hand:
// each channel is ink × share + ground × (1 − share), rounded).
const theme = `
  --ground: light-dark(#ffffff, #000000);
  --ink: light-dark(#000000, #ffffff);
  --accent: light-dark(#2e46d1, #8a9bff);
  --alpha-shade-faint: 14%;
`;

describe('the colours of the icons', () => {
  test('the faint spine is ink at the faint share over the ground of the icon', () => {
    const { light, dark, staging } = iconPalettes(theme);

    expect(light).toEqual({ ground: '#ffffff', ink: '#000000', accent: '#2e46d1', faint: '#dbdbdb' });
    expect(dark).toEqual({ ground: '#000000', ink: '#ffffff', accent: '#8a9bff', faint: '#242424' });
    // The orange ground of Staging, Preview and Local (#f97316), light ink.
    expect(staging).toEqual({ ground: '#f97316', ink: '#000000', accent: '#2e46d1', faint: '#d66313' });
  });

  test('a token missing from theme.css stops the script', () => {
    expect(() => iconPalettes('--ground: light-dark(#ffffff, #000000);')).toThrow('--ink');
  });
});

describe('the icons under public/', () => {
  const publicDir = new URL('../public/', import.meta.url);
  const css = readFileSync(new URL('../src/styles/theme.css', import.meta.url), 'utf8');
  const filesIn = (extension: string) =>
    readdirSync(publicDir, { recursive: true, encoding: 'utf8' })
      .filter((path) => path.endsWith(extension))
      .sort();

  test('every SVG icon is what the script draws from theme.css (run `bun scripts/icons.ts`)', () => {
    const drawn = iconSvgs(css);
    expect(filesIn('.svg')).toEqual(drawn.map((icon) => icon.path).sort());
    for (const icon of drawn) expect(readFileSync(new URL(icon.path, publicDir), 'utf8'), icon.path).toBe(icon.svg);
  });

  test('the script renders every PNG icon, so none is drawn by hand', () => {
    expect(filesIn('.png')).toEqual(iconPngs.map((png) => png.path).sort());
  });
});
