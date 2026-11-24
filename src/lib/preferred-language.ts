// The Preferred Language (glossary; ADR 0021), kept on this device as the app
// language is. With no choice it follows the app language.
import type { Language } from "./i18n/i18n";
import { keptChoice } from "./kept-choice";
import {
  preferredLanguages,
  type PreferredLanguage,
} from "./catalog/languages";

const kept = keptChoice(
  "atomes:preferred-language",
  ["", ...preferredLanguages] as const,
  "",
);

export const readPreferredLanguage = (app: Language): PreferredLanguage =>
  kept.read() || app;
export const savePreferredLanguage = (language: PreferredLanguage): void =>
  kept.save(language);
