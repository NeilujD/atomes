// The share picture has one fixed dark look (ADR 0019, R4): its colours are
// hex values, since a canvas reads no CSS variable. They must stay the dark
// values of theme.css: this test reads theme.css and fails when one differs.
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { pictureAlpha, pictureColours, pictureGlow, withAlpha } from './picture-colours';

const css = readFileSync(new URL('../../styles/theme.css', import.meta.url), 'utf8');

function darkOf(name: string): string {
  const found = new RegExp(`${name}:\\s*light-dark\\(#[0-9a-f]{6},\\s*(#[0-9a-f]{6})\\)`, 'i').exec(css);
  if (!found) throw new Error(`No light-dark() pair for ${name} in theme.css`);
  return found[1].toLowerCase();
}

function share(name: string): number {
  const found = new RegExp(`${name}:\\s*(\\d+(?:\\.\\d+)?)(%?);`).exec(css);
  if (!found) throw new Error(`No ${name} in theme.css`);
  return Number(found[1]) / (found[2] === '%' ? 100 : 1);
}

describe('the colours of the share picture', () => {
  test('are the dark values of theme.css', () => {
    expect(pictureColours).toEqual({
      ground: darkOf('--ground'),
      ink: darkOf('--ink'),
      accent: darkOf('--accent'),
      accentFill: darkOf('--accent-fill'),
    });
  });

  test('the text, line and fill levels are the shares of ink of theme.css', () => {
    expect(pictureAlpha).toEqual({
      textHeading: share('--alpha-text-heading'),
      textQuiet: share('--alpha-text-quiet'),
      lineCard: share('--alpha-line-card'),
      lineButton: share('--alpha-line-button'),
      fillCard: share('--alpha-fill-card'),
      shadeFaint: share('--alpha-shade-faint'),
    });
  });

  test('the glow is the glow of theme.css', () => {
    expect(pictureGlow).toEqual({
      alphas: [1, 2, 3, 4].map((at) => share(`--glow-alpha-${at}`)),
      stops: [0, share('--glow-stop-2'), share('--glow-stop-3'), share('--glow-stop-4')],
      opacities: [1, 2, 3].map((at) => share(`--glow-opacity-${at}`)),
    });
  });

  test('a share of a colour is its hex with an alpha byte', () => {
    expect(withAlpha('#f1f1ec', 0.72)).toBe('#f1f1ecb8');
    expect(withAlpha('#f1f1ec', 0.05)).toBe('#f1f1ec0d');
    expect(withAlpha('#4b5fe6', 0)).toBe('#4b5fe600');
    expect(withAlpha('#4b5fe6', 1)).toBe('#4b5fe6ff');
  });
});
