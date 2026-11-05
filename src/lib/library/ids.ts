// What Library records use to point at the Catalog (ADR 0010): an Edition is
// its ISBN-13, a Work or a Series is a Catalog identifier `<scheme>:<value>`
// that every Catalog instance can resolve. Each identifier is also a valid
// record key, so a Reading Status or a follow can be keyed by it.

// ISBN-13: 13 digits, prefix 978 or 979 but not 9790 (sheet music), valid check digit.
export function isIsbn13(value: string): boolean {
  if (!/^97[89]\d{10}$/.test(value) || value.startsWith('9790')) return false;
  const sum = [...value].reduce((total, digit, i) => total + Number(digit) * (i % 2 === 0 ? 1 : 3), 0);
  return sum % 10 === 0;
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
  return isSeriesId(value) || (value.startsWith('isbn:') && isIsbn13(value.slice('isbn:'.length)));
}

export function editionWork(isbn: string): string {
  return `isbn:${isbn}`;
}
