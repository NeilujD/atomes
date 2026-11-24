// The languages of Editions. UNIMARC 101 $a and Open Library give ISO 639-2/B
// codes ("fre"); Intl and Inventaire labels use BCP 47 ones ("fr").
export const bcp47: Record<string, string> = {
  fre: "fr",
  eng: "en",
  jpn: "ja",
  ger: "de",
  spa: "es",
  ita: "it",
  kor: "ko",
  por: "pt",
  dut: "nl",
  rus: "ru",
  tur: "tr",
};

// The Preferred Language choices (glossary): the languages the sources give
// most, and "all".
export const preferredLanguages = [
  "fr",
  "en",
  "es",
  "it",
  "de",
  "ja",
  "all",
] as const;
export type PreferredLanguage = (typeof preferredLanguages)[number];

export const parsePreferredLanguage = (
  value: string | null | undefined,
): PreferredLanguage | undefined =>
  preferredLanguages.find((language) => language === value);

// A language named in itself, as the language pickers do: "Français", "日本語".
export function nativeLanguageName(code: string): string {
  const name =
    new Intl.DisplayNames(code, { type: "language" }).of(code) ?? code;
  return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
}
