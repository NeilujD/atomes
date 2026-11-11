// What one open source says about an ISBN (spike 0002, section 1). The Catalog
// merges the facts of every source into one Edition.

export type SourceName = 'BnF' | 'SUDOC' | 'Inventaire' | 'Open Library';

export interface Facts {
  source: SourceName;
  title?: string;
  volumeTitle?: string;
  authors?: string[];
  publisher?: string;
  language?: string;
  format?: string;
  cover?: string;
  // `id` is a shared Catalog identifier (`wd:`, `inv:`, `ol:`) when the source has one.
  work?: { id: string; title?: string };
  series?: { id?: string; title?: string; bnfId?: string };
  // The Volumes of the Edition, in order: several for an omnibus.
  volumes?: number[];
}

// An omnibus holds a few Volumes: "1-2", "Tomes 1 à 3", "Tome 1 & 2", "T01 à T03".
const rangePattern = /^(?:tomes?|t\.?|vol(?:ume)?s?\.?)?\s*(\d+)\s*(?:-|–|à|&|et)\s*(?:tomes?|t\.?)?\s*(\d+)$/i;
const maxOmnibusVolumes = 50;
// No Series reaches Volume 1000 (Kochikame stopped at 200): "2019-2020" are years.
const firstYear = 1000;

// The Volumes of an Edition (see volumeNumber), several for an omnibus. A
// range of years ("2019-2020"), a range that runs backwards or a very long one
// is no Volume.
export function volumeNumbers(raw: string | undefined): number[] {
  const range = rangePattern.exec(raw?.replace(/[[\]()]/g, '').trim() ?? '');
  if (!range) {
    const volume = singleVolume(raw);
    return volume === undefined ? [] : [volume];
  }
  const [first, last] = [Number(range[1]), Number(range[2])];
  if (last <= first || last - first >= maxOmnibusVolumes || first >= firstYear) return [];
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

// The first Volume of an Edition (see volumeNumbers).
export function volumeNumber(raw: string | undefined): number | undefined {
  return volumeNumbers(raw)[0];
}

// Volume numbers come as "56", "[5]", "Tome 3", "T. 12" or "I".
function singleVolume(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = raw.replace(/[[\]()]/g, '').trim();
  const digits = /\d+(?:[.,]\d+)?/.exec(value)?.[0];
  if (digits) return Number(digits.replace(',', '.'));
  // A well-formed Roman numeral only, so that a word like "Civil" is not one.
  const roman = /^(?:(?:tome|t\.|vol(?:ume)?\.?|livre)\s*)?(C{0,3}(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3}))\.?$/i.exec(value)?.[1];
  return roman ? romanNumber(roman.toUpperCase()) : undefined;
}

function romanNumber(roman: string): number {
  const values: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  return [...roman].reduce((total, letter, i) => {
    const value = values[letter];
    return value < (values[roman[i + 1]] ?? 0) ? total - value : total + value;
  }, 0);
}
