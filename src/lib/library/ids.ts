// What Library records use to point at the Catalog (ADR 0010): an Edition is
// its ISBN-13, a Work or a Series is a Catalog identifier `<scheme>:<value>`
// that every Catalog instance can resolve. Each identifier is also a valid
// record key, so a Reading Status or a follow can be keyed by it.

// ISBN-13: 13 digits, prefix 978 or 979 but not 9790 (sheet music), valid check digit.
export function isIsbn13(value: string): boolean {
  return /^97[89]\d{10}$/.test(value) && !value.startsWith('9790') && ean13Sum(value) % 10 === 0;
}

// EAN-13 weights 1, 3, 1, 3… The check digit makes the sum of all 13 a multiple of 10.
function ean13Sum(digits: string): number {
  return [...digits].reduce((total, digit, i) => total + Number(digit) * (i % 2 === 0 ? 1 : 3), 0);
}

export type IsbnProblem = 'not-isbn' | 'check-digit' | 'sheet-music' | 'magazine';

// What a barcode or the reader's typing gives: the ISBN-13, or why it is not
// one (spike 0002, ISBN rules). An ISBN-10 becomes 978 + its first 9 digits +
// a new check digit. Never the reverse: 979 ISBNs have no ISBN-10.
export function readIsbn(text: string): { isbn: string } | { problem: IsbnProblem } {
  const value = text.replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{9}[\dX]$/.test(value)) {
    const sum = [...value].reduce((total, char, i) => total + (char === 'X' ? 10 : Number(char)) * (10 - i), 0);
    if (sum % 11 !== 0) return { problem: 'check-digit' };
    const first12 = `978${value.slice(0, 9)}`;
    return { isbn: `${first12}${(10 - (ean13Sum(first12) % 10)) % 10}` };
  }
  if (!/^\d{13}$/.test(value)) return { problem: 'not-isbn' };
  if (value.startsWith('9790')) return { problem: 'sheet-music' };
  if (value.startsWith('977')) return { problem: 'magazine' };
  if (!/^97[89]/.test(value)) return { problem: 'not-isbn' };
  return isIsbn13(value) ? { isbn: value } : { problem: 'check-digit' };
}

// Schemes a Catalog may choose for a Series or a Work, in order of preference.
const sharedSchemes = [
  /^wd:Q[1-9]\d*$/, // Wikidata
  /^inv:[0-9a-f]{32}$/, // Inventaire entity not yet in Wikidata
  /^ol:OL[1-9]\d*[A-Z]$/, // Open Library
  /^atomes:[a-z0-9.-]+(?::\d+)?:[0-9A-HJKMNP-TV-Z]{26}$/, // minted by a Catalog instance: host, then a ULID
];

export function isSeriesId(value: string): boolean {
  return sharedSchemes.some((scheme) => scheme.test(value));
}

// A Work can also be `isbn:<isbn13>`: the one Work of an Edition that no
// Catalog identifies yet. It stays valid once the Catalog learns more.
export function isWorkId(value: string): boolean {
  return isSeriesId(value) || isEditionWork(value);
}

// The Work of an Edition the Catalog did not know when the reader added it.
export function isEditionWork(value: string): boolean {
  return value.startsWith('isbn:') && isIsbn13(value.slice('isbn:'.length));
}

export function editionWork(isbn: string): string {
  return `isbn:${isbn}`;
}
