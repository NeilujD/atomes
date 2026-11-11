// Reads UNIMARC records in MARCXML, as BnF SRU (`unimarcXchange`, prefixed
// tags) and SUDOC (`<ppn>.xml`, plain tags) serve them. The records are flat
// lists of datafields, so a few regular expressions are enough.
import type { Facts, SourceName } from './facts';
import { volumeNumbers } from './facts';

type Field = { tag: string; subfields: [code: string, value: string][] };
export type UnimarcRecord = Field[];

const tagName = (name: string) => `<(?:[\\w-]+:)?${name}\\b`;
const closeTag = (name: string) => `</(?:[\\w-]+:)?${name}>`;
const recordPattern = new RegExp(`${tagName('record')}[^>]*>([\\s\\S]*?)${closeTag('record')}`, 'g');
const fieldPattern = new RegExp(`${tagName('datafield')}([^>]*)>([\\s\\S]*?)${closeTag('datafield')}`, 'g');
const subfieldPattern = new RegExp(`${tagName('subfield')}[^>]*\\bcode="(.)"[^>]*>([\\s\\S]*?)${closeTag('subfield')}`, 'g');

export function unimarcRecords(xml: string): UnimarcRecord[] {
  return [...xml.matchAll(recordPattern)].map(([, body]) =>
    [...body.matchAll(fieldPattern)].map(([, attributes, content]) => ({
      tag: /\btag="(\d{3})"/.exec(attributes)?.[1] ?? '',
      subfields: [...content.matchAll(subfieldPattern)].map(([, code, value]): [string, string] => [code, text(value)]),
    })),
  );
}

// XML entities, then the BnF non-sorting markers around leading articles
// (U+0088/U+0089 and U+0098/U+009C, e.g. "\u0098Les \u009cLégendaires").
function text(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/[\u0088\u0089\u0098\u009c]/g, '')
    .trim();
}

function subfield(record: UnimarcRecord, tag: string, code: string): string | undefined {
  for (const field of record.filter((f) => f.tag === tag)) {
    const value = field.subfields.find(([c, v]) => c === code && v)?.[1];
    if (value) return value;
  }
  return undefined;
}

// The ISBN-13s of a record (field 010 `$a`), ISBN-10s converted.
export function isbns(record: UnimarcRecord): string[] {
  return record
    .filter((f) => f.tag === '010')
    .flatMap((f) => f.subfields.filter(([c]) => c === 'a').map(([, v]) => v.replace(/[\s-]/g, '').toUpperCase()))
    .map((isbn) => (/^\d{9}[\dX]$/.test(isbn) ? isbn10To13(isbn) : isbn));
}

function isbn10To13(isbn10: string): string {
  const body = `978${isbn10.slice(0, 9)}`;
  const sum = [...body].reduce((total, digit, i) => total + Number(digit) * (i % 2 === 0 ? 1 : 3), 0);
  return `${body}${(10 - (sum % 10)) % 10}`;
}

// The record for this ISBN. A source can answer with other Editions (SUDOC's
// isbn2ppn sometimes lists an older one first), so the ISBN must match.
export function recordFor(records: UnimarcRecord[], isbn: string): UnimarcRecord | undefined {
  return records.find((record) => isbns(record).includes(isbn));
}

// The year of publication (214 `$d`, else 210 `$d`), e.g. "DL 2013" → 2013.
export function publishedYear(record: UnimarcRecord): number | undefined {
  const year = /\d{4}/.exec(subfield(record, '214', 'd') ?? subfield(record, '210', 'd') ?? '')?.[0];
  return year ? Number(year) : undefined;
}

// A title that holds the Volume, as records made before publication have it:
// "One Piece - Édition originale - Tome 113", "Spy x Family - Tome 16",
// "Dragon Ball Super - Tomes 1-2".
const volumeInTitle = /^(.+?)\s+-\s+(?:.+\s+-\s+)?(?:tomes?|t\.|vol(?:ume)?s?\.?)\s*(\d+(?:[.,]\d+)?(?:\s*(?:-|–|à|&|et)\s*\d+)?)$/i;

// 461 is the Series link (`$t` title, `$v` number, `$0` BnF Series record).
// 225 and 410 are publisher collections (Folio, Pika Shônen), not Series.
// Recent records often have no 461 yet (One Piece 112, Spy x Family 16): then a
// Volume number in 200 `$h` means "Volume <h> of the Series named <200 $a>",
// and so does a title ending in "- Tome <n>".
export function unimarcFacts(record: UnimarcRecord, source: SourceName): Facts {
  const authors = record
    .filter((f) => f.tag === '700' || f.tag === '701')
    .map((f) => {
      const part = (code: string) => f.subfields.find(([c]) => c === code)?.[1] ?? '';
      return `${part('b')} ${part('a')}`.trim();
    })
    .filter(Boolean);
  const title = subfield(record, '200', 'a');
  const inTitle = title ? volumeInTitle.exec(title) : null;
  const volumes = [subfield(record, '461', 'v'), subfield(record, '200', 'h'), inTitle?.[2]]
    .map(volumeNumbers)
    .find((each) => each.length > 0);
  const seriesTitle = subfield(record, '461', 't') ?? (volumes ? (inTitle ? inTitle[1] : title) : undefined);
  const bnfSeries = source === 'BnF' ? subfield(record, '461', '0') : undefined;
  return {
    source,
    title,
    volumeTitle: subfield(record, '200', 'i'),
    authors,
    publisher: subfield(record, '214', 'c') ?? subfield(record, '210', 'c'),
    language: subfield(record, '101', 'a'),
    format: subfield(record, '215', 'd'),
    series: seriesTitle ? { title: seriesTitle, bnfId: bnfSeries } : undefined,
    volumes,
  };
}
