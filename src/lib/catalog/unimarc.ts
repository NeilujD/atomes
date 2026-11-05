// Reads UNIMARC records in MARCXML, as BnF SRU (`unimarcXchange`, prefixed
// tags) and SUDOC (`<ppn>.xml`, plain tags) serve them. The records are flat
// lists of datafields, so a few regular expressions are enough.
import type { Facts, SourceName } from './facts';
import { volumeNumber } from './facts';

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
function isbns(record: UnimarcRecord): string[] {
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

// 461 is the Series link (`$t` title, `$v` number, `$0` BnF Series record).
// 225 and 410 are publisher collections (Folio, Pika Shônen), not Series.
// Recent records often have no 461 yet (One Piece 112, Spy x Family 16): then a
// Volume number in 200 `$h` means "Volume <h> of the Series named <200 $a>".
export function unimarcFacts(record: UnimarcRecord, source: SourceName): Facts {
  const authors = record
    .filter((f) => f.tag === '700' || f.tag === '701')
    .map((f) => {
      const part = (code: string) => f.subfields.find(([c]) => c === code)?.[1] ?? '';
      return `${part('b')} ${part('a')}`.trim();
    })
    .filter(Boolean);
  const title = subfield(record, '200', 'a');
  const volume = volumeNumber(subfield(record, '461', 'v')) ?? volumeNumber(subfield(record, '200', 'h'));
  const seriesTitle = subfield(record, '461', 't') ?? (volume !== undefined ? title : undefined);
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
    volume,
  };
}
