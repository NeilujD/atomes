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
  volume?: number;
}

// Volume numbers come as "56", "[5]", "Tome 3", "T. 12" or "I".
export function volumeNumber(raw: string | undefined): number | undefined {
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

// Compares titles, publishers and formats: "Glénat" = "glenat", "One Piece" = "One piece",
// "Spy × Family" = "Spy x family".
export function key(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/×/g, 'x')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
