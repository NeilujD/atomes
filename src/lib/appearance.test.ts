import { describe, expect, test } from 'vitest';
import { appearanceKey, bootScript, parseAppearance, resolveTheme } from './appearance';

describe('resolveTheme', () => {
  test.each([
    ['system', false, 'light'],
    ['system', true, 'dark'],
    ['light', false, 'light'],
    ['light', true, 'light'],
    ['dark', false, 'dark'],
    ['dark', true, 'dark'],
  ] as const)('%s with a dark system preference %s gives %s', (appearance, systemPrefersDark, theme) => {
    expect(resolveTheme(appearance, systemPrefersDark)).toBe(theme);
  });
});

describe('parseAppearance', () => {
  test.each(['system', 'light', 'dark'] as const)('keeps %s', (value) => {
    expect(parseAppearance(value)).toBe(value);
  });

  test.each([null, '', 'Dark', 'sepia'])('falls back to system for %o', (value) => {
    expect(parseAppearance(value)).toBe('system');
  });
});

describe('bootScript', () => {
  // Runs the exact script that AppShell inlines in <head>, against a fake page.
  function boot(stored: string | null | Error) {
    const dataset: Record<string, string> = {};
    const localStorage = {
      getItem: (key: string) => {
        if (stored instanceof Error) throw stored;
        return key === appearanceKey ? stored : null;
      },
    };
    const document = { documentElement: { dataset } };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- the script is a string by design: it is inlined in HTML.
    const run = new Function('localStorage', 'document', bootScript) as (ls: typeof localStorage, doc: typeof document) => void;
    run(localStorage, document);
    return dataset.appearance;
  }

  test.each(['light', 'dark'])('forces a stored %s before first paint', (stored) => {
    expect(boot(stored)).toBe(stored);
  });

  test.each([null, 'system', 'sepia'])('leaves the theme to the system for %o', (stored) => {
    expect(boot(stored)).toBeUndefined();
  });

  test('leaves the theme to the system when storage is blocked', () => {
    expect(boot(new Error('SecurityError'))).toBeUndefined();
  });
});
