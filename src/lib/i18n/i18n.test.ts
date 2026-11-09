import { describe, expect, test } from 'vitest';
import { en } from './en';
import { compareText, languageCookie, pageLanguage, requestLanguage, t, translator } from './i18n';

describe('dictionaries', () => {
  test('a language without every key is a type error', () => {
    const { 'nav.home': home, ...incomplete } = en;
    // `bun run check` fails here if a missing key stops being a type error.
    // @ts-expect-error: 'nav.home' is missing
    const missing: typeof en = incomplete;
    expect(home).toBe('Home');
    expect(missing).not.toHaveProperty('nav.home');
  });

  test('each language gives its own text, with the values in place', () => {
    expect(translator('fr')('nav.library')).toBe('Bibliothèque');
    expect(translator('en')('nav.library')).toBe('Library');
    expect(translator('fr')('book.volume', 12)).toBe('Tome 12');
    expect(translator('en')('onboarding.added', 2)).toBe('2 more Volumes are in your Library.');
    expect(translator('fr')('onboarding.added', 1)).toBe('1 tome de plus est dans votre bibliothèque.');
  });

  test('page scripts read English when there is no page (tests in Node)', () => {
    expect(pageLanguage()).toBe('en');
    expect(t('saved.sent')).toBe('Saved to your PDS.');
  });
});

describe('requestLanguage', () => {
  const request = (headers: Record<string, string>) => new Request('http://127.0.0.1:4321/', { headers });

  test.each([
    ['the browser speaks French', { 'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8' }, 'fr'],
    ['the browser speaks English', { 'accept-language': 'en-GB,en;q=0.9' }, 'en'],
    ['another browser language falls back to English', { 'accept-language': 'de-DE,de;q=0.9,fr;q=0.8' }, 'en'],
    ['no language at all', {}, 'en'],
    ['the Settings choice wins', { 'accept-language': 'fr-FR', cookie: `a=1; ${languageCookie}=en` }, 'en'],
    ['an unknown choice is ignored', { 'accept-language': 'fr-FR', cookie: `${languageCookie}=de` }, 'fr'],
  ])('%s', (_, headers, language) => {
    expect(requestLanguage(request(headers))).toBe(language);
  });
});

describe('compareText', () => {
  test('a name with an accent sorts with its letter: "Élise" with the E', () => {
    const names = ['Zoé', 'Emma', 'Élise', 'alice', 'Bob'];
    expect([...names].sort()).toEqual(['Bob', 'Emma', 'Zoé', 'alice', 'Élise']);
    expect([...names].sort(compareText('fr'))).toEqual(['alice', 'Bob', 'Élise', 'Emma', 'Zoé']);
    expect([...names].sort(compareText('en'))).toEqual(['alice', 'Bob', 'Élise', 'Emma', 'Zoé']);
  });

  test('numbers sort by value', () => {
    expect(['Tome 10', 'Tome 2', 'Tome 1'].sort(compareText('fr'))).toEqual(['Tome 1', 'Tome 2', 'Tome 10']);
  });
});
