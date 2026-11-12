// Edition Line keys (ADR 0010): one Series, publisher, language and book size.
// The key is internal: reader records never hold it, so it may change when the
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

// `<Series n>|<publisher>|<language>`: the part of the key every size of the line shares.
export const linePrefix = (n: number, edition: { publisher: string | null; language: string | null }) =>
  [String(n), edition.publisher, edition.language].map((v) => key(v ?? '')).join('|');

// The key ends with the line's book size: the size of the first Edition in it, empty when unknown.
export const lineKey = (prefix: string, height: number | undefined) => `${prefix}|${height ?? ''}`;

export function lineHeight(line: string): number | undefined {
  const height = line.slice(line.lastIndexOf('|') + 1);
  return height ? Number(height) : undefined;
}

// The line an Edition of `height` joins among the `lines` of its prefix: the
// nearest in size, else a new line of its size. An Edition with no size joins
// the line with the most Editions.
export function placeLine(prefix: string, height: number | undefined, lines: { line: string; editions: number }[]): string {
  const gap = (line: string) => (height === undefined ? 0 : Math.abs(height - lineHeight(line)!));
  const fits = lines.filter(({ line }) => height === undefined || (lineHeight(line) !== undefined && sameSize(height, lineHeight(line))));
  const best = fits.sort((a, b) => gap(a.line) - gap(b.line) || b.editions - a.editions)[0];
  return best?.line ?? lineKey(prefix, height);
}
