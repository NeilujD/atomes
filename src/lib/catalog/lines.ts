// Edition Line keys (ADR 0010): one Series, publisher, language and book size,
// then the BnF Series record that names the line (amendment 2026-11-14). The
// key is internal: reader records never hold it, so it may change when the
// Catalog fixes its data.
import { key } from './facts';

// Two Editions 2 cm or more apart in height are in two Edition Lines; 1 cm is
// drift inside one line (One Piece, Glénat: 18 and 19 cm). Amendment 2026-11-12.
const lineGapCm = 2;

// The height in cm the sources give (UNIMARC 215 `$d`): "18 cm", "18 x 12 cm", "18,5 cm".
export function bookHeight(format: string | null | undefined): number | undefined {
  const found = /(\d+(?:[.,]\d+)?)\s*(?:x\s*\d+(?:[.,]\d+)?\s*)?cm\b/i.exec(format ?? '');
  return found ? Number(found[1].replace(',', '.')) : undefined;
}

// An Edition with no size stays in the line, and a line with no size takes any Edition.
export const sameSize = (a: number | undefined, b: number | undefined) => a === undefined || b === undefined || Math.abs(a - b) < lineGapCm;

// The words that name a publisher: "Pika édition" is "pika"; short words and "édition(s)" name none.
export const publisherWords = (publisher: string) => key(publisher).split(' ').filter((word) => word.length > 2 && !/^editions?$/.test(word));

// One publisher under two names when every word of the shorter name is in the
// longer one (ADR 0010, amendment 2026-11-13): Kana published Naruto 1 to 22
// as "Dargaud Bénélux-Kana", then as "Kana".
export function samePublisher(a: string, b: string): boolean {
  const [shorter, longer] = [publisherWords(a), publisherWords(b)].sort((x, y) => x.length - y.length);
  return shorter.length > 0 ? shorter.every((word) => longer.includes(word)) : key(a) === key(b);
}

// `<Series n>|<publisher>|<language>`: the part of the key every size of the line shares.
export const linePrefix = (n: number, edition: { publisher: string | null; language: string | null }) =>
  [String(n), edition.publisher, edition.language].map((v) => key(v ?? '')).join('|');

// A line key, or a prefix, fits a prefix when the Series and language are the
// same and the publisher is the same under either name. The key keeps the name
// of the first Edition in the line.
export function samePrefix(line: string, prefix: string): boolean {
  const [n, publisher, language] = line.split('|');
  const [otherN, otherPublisher, otherLanguage] = prefix.split('|');
  return n === otherN && language === otherLanguage && samePublisher(publisher, otherPublisher);
}

// The key ends with the line's book size (the size of the first Edition in
// it, empty when unknown) and the id of the largest BnF Series record of the
// line (empty when none is known yet).
export const lineKey = (prefix: string, height: number | undefined, record?: string) => `${prefix}|${height ?? ''}|${record ?? ''}`;

// Keys made before the record part (amendment 2026-11-14) have four parts; the size is the fourth either way.
export function lineHeight(line: string): number | undefined {
  const height = line.split('|')[3];
  return height ? Number(height) : undefined;
}

export const lineRecord = (line: string): string | undefined => line.split('|')[4] || undefined;

// The line an Edition of `height` joins among the `lines` of its prefix: the
// nearest in size, else a new line of its size, named by its BnF Series
// `record`. An Edition with no size joins the line with the most Editions.
export function placeLine(prefix: string, height: number | undefined, lines: { line: string; editions: number }[], record?: string): string {
  const gap = (line: string) => (height === undefined ? 0 : Math.abs(height - lineHeight(line)!));
  const fits = lines.filter(({ line }) => height === undefined || (lineHeight(line) !== undefined && sameSize(height, lineHeight(line))));
  const best = fits.sort((a, b) => gap(a.line) - gap(b.line) || b.editions - a.editions)[0];
  return best?.line ?? lineKey(prefix, height, record);
}

// Two BnF Series records that share more Volume numbers than this hold two
// editions (Dragon Ball: 34338439, 38839216, 39250101). A guess from three
// Series (ADR 0010, amendment 2026-11-14).
export const maxSharedVolumes = 1;

// The groups of BnF Series records inside one Edition Line key: the largest
// record (most Editions) first; a record joins the first group with which it
// shares at most `maxSharedVolumes` Volume numbers, else starts a group. Gives
// each record the id of its group's largest record: each group is an Edition
// Line. Editions with no record are in no group (the fill puts them in the first).
export function recordGroups(editions: { record?: string; volumes: number[] }[]): Map<string, string> {
  const records = new Map<string, { count: number; volumes: Set<number> }>();
  for (const { record, volumes } of editions) {
    if (!record) continue;
    const found = records.get(record) ?? { count: 0, volumes: new Set<number>() };
    found.count++;
    for (const volume of volumes) found.volumes.add(volume);
    records.set(record, found);
  }
  const groups: { id: string; volumes: Set<number> }[] = [];
  const groupOf = new Map<string, string>();
  const largestFirst = [...records].sort(([a, x], [b, y]) => y.count - x.count || (a < b ? -1 : 1));
  for (const [record, { volumes }] of largestFirst) {
    const shared = (group: Set<number>) => [...volumes].filter((volume) => group.has(volume)).length;
    let group = groups.find((each) => shared(each.volumes) <= maxSharedVolumes);
    if (!group) groups.push((group = { id: record, volumes: new Set() }));
    for (const volume of volumes) group.volumes.add(volume);
    groupOf.set(record, group.id);
  }
  return groupOf;
}

// The name of an Edition Line (ADR 0010, amendment 2026-11-14): the publisher
// most of its Editions name (Naruto: "Kana", not "Dargaud Bénélux-Kana"), and
// the first and last year of its Editions. No year known: null years.
export interface LineName {
  publisher: string | null;
  first: number | null;
  last: number | null;
}

// One Edition Line of Search (CORE-187): the same name and language.
export const sameLine = (a: LineName & { language: string | null }, b: LineName & { language: string | null }) =>
  a.publisher === b.publisher && a.first === b.first && a.last === b.last && a.language === b.language;

export function lineName(editions: { publisher: string | null; year?: number | null }[]): LineName {
  const counts = new Map<string, number>();
  for (const { publisher } of editions) if (publisher) counts.set(publisher, (counts.get(publisher) ?? 0) + 1);
  const publisher = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const years = editions.flatMap(({ year }) => (typeof year === 'number' ? [year] : []));
  return { publisher, first: years.length ? Math.min(...years) : null, last: years.length ? Math.max(...years) : null };
}
