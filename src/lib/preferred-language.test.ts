// @vitest-environment happy-dom
import { afterEach, describe, expect, test } from 'vitest';
import { readPreferredLanguage, savePreferredLanguage } from './preferred-language';

afterEach(() => localStorage.clear());

describe('Preferred Language (CORE-186)', () => {
  test.each(['fr', 'en'] as const)('with no choice, it follows the app language (%s)', (app) => {
    expect(readPreferredLanguage(app)).toBe(app);
  });

  test('a choice stays after a reload, whatever the app language', () => {
    savePreferredLanguage('all');

    expect(readPreferredLanguage('fr')).toBe('all');
    expect(readPreferredLanguage('en')).toBe('all');
  });

  test('a kept value that is no choice gives the app language', () => {
    localStorage.setItem('atomes:preferred-language', 'klingon');

    expect(readPreferredLanguage('fr')).toBe('fr');
  });
});
