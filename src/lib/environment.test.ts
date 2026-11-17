import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { appIcons, webManifest } from './environment';
import type { AppEnv } from './server/settings';

// Every icon the web manifest and the page head list is a file in public/, so
// a renamed or forgotten PNG fails here, not on a reader's home screen.
// `bun scripts/icons.ts` makes them all from the SVG sources.
const environments: AppEnv[] = ['production', 'staging', 'preview', 'local'];

const inPublic = (src: string) => new URL(`../../public${src}`, import.meta.url);

// A PNG says its size in its IHDR chunk: width at byte 16, height at byte 20.
function pngSize(src: string): string {
  const bytes = readFileSync(inPublic(src));
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

describe.each(environments)('%s', (appEnv) => {
  test('every icon of the web manifest is a PNG of its listed size', () => {
    for (const icon of webManifest(appEnv).icons) {
      expect(existsSync(inPublic(icon.src)), icon.src).toBe(true);
      expect(pngSize(icon.src), icon.src).toBe(icon.sizes);
    }
  });

  test('the favicons and the Apple touch icon exist', () => {
    const icons = appIcons(appEnv);
    for (const src of [icons.favicon, icons.favicon32, icons.appleTouch]) {
      expect(existsSync(inPublic(src)), src).toBe(true);
    }
    expect(pngSize(icons.favicon32)).toBe('32x32');
    expect(pngSize(icons.appleTouch)).toBe('180x180');
  });
});
