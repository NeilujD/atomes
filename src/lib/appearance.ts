// The Appearance setting (System, Light or Dark) and the contrast setting
// (System or High), kept on the device. CSS does the painting (theme.css):
// `color-scheme: light dark` and `prefers-contrast` follow the system;
// `data-appearance` on <html> forces one theme, `data-contrast="more"` raises
// the contrast.
import { keptChoice } from './kept-choice';

export const appearances = ['system', 'light', 'dark'] as const;
export type Appearance = (typeof appearances)[number];
export type Theme = 'light' | 'dark';

export const appearanceKey = 'atomes:appearance';

export const { parse: parseAppearance, read: readAppearance, save: saveAppearance } = keptChoice(appearanceKey, appearances, 'system');

export function resolveTheme(appearance: Appearance, systemPrefersDark: boolean): Theme {
  if (appearance === 'system') return systemPrefersDark ? 'dark' : 'light';
  return appearance;
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

export const contrasts = ['system', 'more'] as const;
export type Contrast = (typeof contrasts)[number];

export const contrastKey = 'atomes:contrast';

export const { parse: parseContrast, read: readContrast, save: saveContrast } = keptChoice(contrastKey, contrasts, 'system');

export function applyContrast(doc: Document, contrast: Contrast): void {
  const root = doc.documentElement;
  if (contrast === 'more') root.dataset.contrast = 'more';
  else delete root.dataset.contrast;
}

// Inlined in <head> by AppShell, so a forced theme and a raised contrast are
// set before first paint. It cannot import this module, so it repeats the
// forced values of parseAppearance and parseContrast.
export const bootScript = `try{var d=document.documentElement.dataset,a=localStorage.getItem(${JSON.stringify(appearanceKey)});if(a==="light"||a==="dark")d.appearance=a;if(localStorage.getItem(${JSON.stringify(contrastKey)})==="more")d.contrast="more"}catch(e){}`;
