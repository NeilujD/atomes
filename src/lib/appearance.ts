// The Appearance setting: System, Light or Dark, kept on the device.
// CSS does the painting (theme.css): `color-scheme: light dark` follows the
// system, and `data-appearance` on <html> forces one theme.

export const appearances = ['system', 'light', 'dark'] as const;
export type Appearance = (typeof appearances)[number];
export type Theme = 'light' | 'dark';

export const appearanceKey = 'atomes:appearance';

export function parseAppearance(value: string | null): Appearance {
  return appearances.find((appearance) => appearance === value) ?? 'system';
}

export function resolveTheme(appearance: Appearance, systemPrefersDark: boolean): Theme {
  if (appearance === 'system') return systemPrefersDark ? 'dark' : 'light';
  return appearance;
}

// Storage can be blocked (private mode, browser settings): even reading
// `localStorage` can throw. Then the setting lasts for the page only.
export function readAppearance(): Appearance {
  try {
    return parseAppearance(localStorage.getItem(appearanceKey));
  } catch {
    return 'system';
  }
}

export function saveAppearance(appearance: Appearance): void {
  try {
    localStorage.setItem(appearanceKey, appearance);
  } catch {
    // See readAppearance.
  }
}

export function applyAppearance(doc: Document, appearance: Appearance, systemPrefersDark: boolean): void {
  const root = doc.documentElement;
  if (appearance === 'system') delete root.dataset.appearance;
  else root.dataset.appearance = appearance;

  // The browser bar colour: AppShell renders one theme-color meta per theme.
  const theme = resolveTheme(appearance, systemPrefersDark);
  for (const meta of doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.media = meta.dataset.theme === theme ? 'all' : 'not all';
  }
}

// Inlined in <head> by AppShell, so a forced theme is set before first paint.
// It cannot import this module, so it repeats the forced values of parseAppearance.
export const bootScript = `try{var a=localStorage.getItem(${JSON.stringify(appearanceKey)});if(a==="light"||a==="dark")document.documentElement.dataset.appearance=a}catch(e){}`;
