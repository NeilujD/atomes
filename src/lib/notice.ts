// What the Privacy notice and the Legal notice show for a fact this instance
// does not give in its settings (LEGAL_*, settings.ts): the missing settings, by name.
import type { Translate } from './i18n/i18n';

export function notGiven(t: Translate, ...settings: (string | false)[]): string {
  return t('notice.not-set', settings.filter(Boolean).join(', '));
}
