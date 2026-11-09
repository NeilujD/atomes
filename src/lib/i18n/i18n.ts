// UI text in French and English (ADR 0015): one typed dictionary per language,
// read through `t(key)`. The server picks the language of each request and
// writes it on <html lang>; the scripts of the page read it there.
import { en } from './en';
import { fr } from './fr';

export const languages = ['fr', 'en'] as const;
export type Language = (typeof languages)[number];

type Messages = typeof en;
export type MessageKey = keyof Messages;
// A text with values takes them as arguments: t('book.volume', 12).
type Args<K extends MessageKey> = Messages[K] extends (...args: infer A) => string ? A : [];
export type Translate = <K extends MessageKey>(key: K, ...args: Args<K>) => string;

const dictionaries: Record<Language, Messages> = { fr, en };

export function parseLanguage(value: string | null | undefined): Language | undefined {
  return languages.find((language) => language === value);
}

export function translator(language: Language): Translate {
  const messages: Record<MessageKey, string | ((...args: never[]) => string)> = dictionaries[language];
  return (key, ...args) => {
    const message = messages[key];
    return typeof message === 'string' ? message : (message as (...values: unknown[]) => string)(...args);
  };
}

// The Settings choice, kept in a cookie so the server sees it. No cookie: the browser's language.
export const languageCookie = 'atomes-language';

// The Settings choice, else the browser's first language (the first one in
// Accept-Language, as `navigator.language`), else English.
export function requestLanguage(request: Request): Language {
  const chosen = request.headers
    .get('cookie')
    ?.split(';')
    .map((pair) => pair.trim().split('='))
    .find(([name]) => name === languageCookie)?.[1];
  const browser = request.headers.get('accept-language')?.split(',')[0]?.split(';')[0]?.split('-')[0]?.trim().toLowerCase();
  return parseLanguage(chosen) ?? parseLanguage(browser) ?? 'en';
}

// In the browser. Undefined goes back to the browser's language.
export function saveLanguage(language: Language | undefined): void {
  document.cookie = `${languageCookie}=${language ?? ''}; Path=/; SameSite=Lax; Max-Age=${language ? 400 * 24 * 3600 : 0}`;
}

// In a page script: the language the server wrote on <html lang>. With no
// document (tests in Node), English.
export function pageLanguage(): Language {
  return (typeof document === 'undefined' ? undefined : parseLanguage(document.documentElement.lang)) ?? 'en';
}

// `t` for page scripts and the modules they use. On the server, use
// `translator(requestLanguage(Astro.request))`: there is no page there.
export const t: Translate = (key, ...args) => translator(pageLanguage())(key, ...args);

// Sorts text as a reader of the language expects: accents and case count
// after the letter ("Élise" goes with the E's), and "Tome 2" before "Tome 10".
export function compareText(language: Language): (a: string, b: string) => number {
  return new Intl.Collator(language, { numeric: true }).compare;
}
