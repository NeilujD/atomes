import { describe, expect, test } from 'vitest';
import { appearanceKey, bootScript, contrastKey, parseAppearance, parseContrast, resolveTheme } from './appearance';

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

describe('parseContrast', () => {
  test.each(['system', 'more'] as const)('keeps %s', (value) => {
    expect(parseContrast(value)).toBe(value);
  });

  test.each([null, '', 'less', 'More'])('falls back to system for %o', (value) => {
    expect(parseContrast(value)).toBe('system');
  });
});

describe('bootScript', () => {
  // Runs the exact script that AppShell inlines in <head>, against a fake page.
  function boot(stored: Record<string, string> | Error) {
    const dataset: Record<string, string> = {};
    const localStorage = {
      getItem: (key: string) => {
        if (stored instanceof Error) throw stored;
        return stored[key] ?? null;
      },
    };
    const document = { documentElement: { dataset } };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- the script is a string by design: it is inlined in HTML.
    const run = new Function('localStorage', 'document', bootScript) as (ls: typeof localStorage, doc: typeof document) => void;
    run(localStorage, document);
    return dataset;
  }

  test.each(['light', 'dark'])('forces a stored %s before first paint', (stored) => {
    expect(boot({ [appearanceKey]: stored }).appearance).toBe(stored);
  });

  test.each(['system', 'sepia'])('leaves the theme to the system for %o', (stored) => {
    expect(boot({ [appearanceKey]: stored }).appearance).toBeUndefined();
  });

  test('raises a stored high contrast before first paint', () => {
    expect(boot({ [contrastKey]: 'more' }).contrast).toBe('more');
  });

  test.each(['system', 'less'])('leaves the contrast to the system for %o', (stored) => {
    expect(boot({ [contrastKey]: stored }).contrast).toBeUndefined();
  });

  test('sets both when both are stored', () => {
    expect(boot({ [appearanceKey]: 'dark', [contrastKey]: 'more' })).toEqual({ appearance: 'dark', contrast: 'more' });
  });

  test('leaves both to the system with nothing stored, or when storage is blocked', () => {
    expect(boot({})).toEqual({});
    expect(boot(new Error('SecurityError'))).toEqual({});
  });
});
