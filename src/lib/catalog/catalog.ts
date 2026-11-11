// The Catalog (ADR 0004, 0007, 0010): answers "what is this ISBN?" from its own
// SQLite file, and asks the open sources only on a miss. It also serves covers,
// so the reader's browser never asks a source for one (ADR 0001). It stores
// books only: no reader identity, no Library data.
import { DatabaseSync } from 'node:sqlite';
import { editionWork } from '../library/ids';
import type { Facts, SourceName } from './facts';
import type { SourceFetch } from './sources';
import { bnfSearch, fetchFacts, inventaireEditions, isCoverUrl, type Listed } from './sources';

type Series = { id: string; title: string };

export interface Edition {
  isbn: string;
  title: string;
  volumeTitle: string | null;
  authors: string[];
  publisher: string | null;
  language: string | null;
  format: string | null;
  cover: string | null;
  work: { id: string; title: string };
  series: Series | null;
  volume: number | null;
  // Licence Ouverte (BnF, SUDOC) asks to show the source and its date.
  // `reader`: no source knows the ISBN, a reader picked its Series (CORE-40).
  sources: EditionSource[];
  fetchedAt: string;
}

export type EditionSource = SourceName | 'reader';

export type Lookup = { found: Edition } | { notFound: true } | { unavailable: true };

// What BnF lists under a typed title (CORE-40): Edition Lines to pick a Volume
// in, and books with no Volume. `anchor` is an ISBN BnF knows in each.
export interface LineFound {
  anchor: string;
  series: string;
  publisher: string | null;
  language: string | null;
  volumes: number[];
}

export interface WorkFound {
  anchor: string;
  title: string;
  authors: string[];
  publisher: string | null;
  year: number | null;
}

export interface SearchFound {
  lines: LineFound[];
  works: WorkFound[];
}

// What a reader picks for an ISBN no source knows: Volume `volume` of the
// Edition Line of `anchor`, or, with no Volume, the Work of `anchor`.
export interface Choice {
  anchor: string;
  volume: number | null;
  title: string;
  authors: string[];
}

export type Chosen =
  | { found: Edition }
  // A source knows the ISBN: its Edition stays.
  | { known: Edition }
  // `anchor` is unknown, has no Series for a Volume, or has no shared Work.
  | { badAnchor: 'unknown' | 'no-series' | 'no-shared-work' }
  | { unavailable: true };

export interface Cover {
  type: string;
  bytes: Uint8Array<ArrayBuffer>;
}

export type CoverLookup = { found: Cover } | { notFound: true } | { unavailable: true };

export interface Catalog {
  lookup(isbn: string): Promise<Lookup>;
  // The Volumes of the Edition Line of `anchor` (ADR 0010), by Volume number.
  // Only `anchor` when it has no Series. With `fill`, asks BnF for the whole
  // Edition Line at most once a week; the Volumes known so far without `fill`
  // or when that fails.
  volumes(anchor: Edition, options: { fill: boolean }): Promise<Edition[]>;
  // The Edition Lines and books BnF lists under a title (and publisher): one
  // page of 50 records. Only the typed words leave the server.
  search(title: string, publisher?: string): Promise<SearchFound | { unavailable: true }>;
  // Keeps the reader's choice for an ISBN no source knows. Every reader of the
  // instance gets it; a later choice replaces it, and so does a source that
  // learns the ISBN, whole (no merge).
  choose(isbn: string, choice: Choice): Promise<Chosen>;
  // The cover of the Edition, fetched once from its source and kept.
  cover(isbn: string): Promise<CoverLookup>;
  close(): void;
}

// The most candidates of each kind a search gives.
const maxFound = 10;

// Sources add Series links to recent records months later (spike 0002): fetch
// an Edition again after a month, and an unknown ISBN again after a day.
const editionTtlMs = 30 * 24 * 3600 * 1000;
const missTtlMs = 24 * 3600 * 1000;
// New Volumes come out about once a month in a Series.
const fillTtlMs = 7 * 24 * 3600 * 1000;
// After a failed fill, the sources rest: each /volumes call of a signed-in
// reader must not start a new BnF search while a source is down.
const fillRetryMs = 3600 * 1000;

// Pictures only, never SVG: it can hold scripts.
const coverTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const maxCoverBytes = 2 * 1024 * 1024;

const schema = `
  create table if not exists series (
    id text primary key,
    title text not null,
    title_key text not null,
    bnf_id text
  );
  create index if not exists series_title_key on series (title_key);
  create table if not exists edition (
    isbn text primary key,
    title text not null,
    volume_title text,
    authors text not null,
    publisher text,
    language text,
    format text,
    cover text,
    work_id text not null,
    work_title text not null,
    series_id text references series (id),
    volume real,
    edition_line text,
    sources text not null,
    fetched_at text not null
  );
  create index if not exists edition_line on edition (edition_line);
  create table if not exists miss (
    isbn text primary key,
    checked_at text not null
  );
  create table if not exists line_fill (
    edition_line text primary key,
    filled_at text not null
  );
  create table if not exists cover (
    isbn text primary key,
    url text not null,
    type text not null,
    bytes blob not null
  );
`;

type EditionRow = {
  isbn: string;
  title: string;
  volume_title: string | null;
  authors: string;
  publisher: string | null;
  language: string | null;
  format: string | null;
  cover: string | null;
  work_id: string;
  work_title: string;
  series_id: string | null;
  series_title: string | null;
  volume: number | null;
  sources: string;
  fetched_at: string;
};

const selectEdition = `select edition.*, series.title as series_title from edition left join series on series.id = edition.series_id`;

// `host` mints `atomes:<host>:<ULID>` Series identifiers when no source has one.
export function createCatalog(options: { file: string; fetch: SourceFetch; host: string; now?: () => Date }): Catalog {
  const now = options.now ?? (() => new Date());
  const db = new DatabaseSync(options.file);
  // WAL: the hourly backup reads a snapshot while the server keeps writing (docs/backups.md).
  db.exec('pragma journal_mode = wal');
  db.exec(schema);

  const editionRow = (isbn: string) => db.prepare(`${selectEdition} where edition.isbn = ?`).get(isbn) as EditionRow | undefined;
  const age = (iso: string) => now().getTime() - Date.parse(iso);

  function seriesFor(facts: Facts[]): Series | null {
    const shared = facts.find((f) => f.series?.id && f.series.title)?.series;
    const title = shared?.title ?? facts.find((f) => f.series?.title)?.series?.title;
    if (!title) return null;
    const bnfId = facts.find((f) => f.series?.bnfId)?.series?.bnfId ?? null;
    const titleKey = key(title);
    // Once a Series has an identifier here it keeps it (ADR 0010), even when a
    // later Volume brings a shared one.
    const find = (column: string, value: string | null | undefined) =>
      value ? (db.prepare(`select id, title from series where ${column} = ? order by rowid`).get(value) as Series | undefined) : undefined;
    const known = find('id', shared?.id) ?? find('bnf_id', bnfId) ?? find('title_key', titleKey);
    if (known) return known;
    const id = shared?.id ?? `atomes:${options.host}:${ulid(now())}`;
    db.prepare('insert into series (id, title, title_key, bnf_id) values (?, ?, ?, ?)').run(id, title, titleKey, bnfId);
    return { id, title };
  }

  // One Edition from the facts of every source, best source first. Sources
  // sometimes attach an ISBN to the wrong book (9780000000002 is three
  // different books in SUDOC, Inventaire and Open Library), so only sources
  // whose title matches the best source's title, or its Series title, are
  // merged: BnF may title a Volume by its own name ("Mission start") where
  // Inventaire says "Spy × Family, Tome 2".
  function merge(isbn: string, all: Facts[]): Edition | undefined {
    const best = all.find((f) => f.title);
    const title = best?.title;
    if (!title) return undefined;
    const seriesTitle = best.series?.title;
    const facts = all.filter((f) => f.title && (sameBook(f.title, title) || (seriesTitle && sameBook(f.title, seriesTitle))));
    const pick = <T>(get: (f: Facts) => T | undefined) => facts.map(get).find((v) => v !== undefined && v !== '');
    const series = seriesFor(facts);
    const work = facts.find((f) => f.work)?.work;
    const edition: Edition = {
      isbn,
      title,
      volumeTitle: pick((f) => f.volumeTitle) ?? null,
      authors: pick((f) => (f.authors?.length ? f.authors : undefined)) ?? [],
      publisher: pick((f) => f.publisher) ?? null,
      language: pick((f) => f.language) ?? null,
      format: pick((f) => f.format) ?? null,
      cover: pick((f) => f.cover) ?? null,
      work: { id: work?.id ?? editionWork(isbn), title: work?.title ?? title },
      series,
      volume: pick((f) => f.volume) ?? null,
      sources: facts.map((f) => f.source),
      fetchedAt: now().toISOString(),
    };
    return edition;
  }

  function store(edition: Edition): void {
    const { series } = edition;
    const line = editionLine(edition);
    db.prepare(
      `insert or replace into edition (isbn, title, volume_title, authors, publisher, language, format, cover, work_id,
        work_title, series_id, volume, edition_line, sources, fetched_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      edition.isbn,
      edition.title,
      edition.volumeTitle,
      JSON.stringify(edition.authors),
      edition.publisher,
      edition.language,
      edition.format,
      edition.cover,
      edition.work.id,
      edition.work.title,
      series?.id ?? null,
      edition.volume,
      line,
      JSON.stringify(edition.sources),
      edition.fetchedAt,
    );
    db.prepare('delete from miss where isbn = ?').run(edition.isbn);
  }

  // A reader's choice (CORE-40) stands for an ISBN the sources still miss: they
  // are asked about it as about an unknown ISBN, once a day.
  async function lookup(isbn: string): Promise<Lookup> {
    const row = editionRow(isbn);
    const chosen = row && isReader(toEdition(row));
    if (row && !chosen && age(row.fetched_at) < editionTtlMs) return { found: toEdition(row) };
    const miss = db.prepare('select checked_at from miss where isbn = ?').get(isbn) as { checked_at: string } | undefined;
    if ((!row || chosen) && miss && age(miss.checked_at) < missTtlMs) return row ? { found: toEdition(row) } : { notFound: true };

    const { facts, failed } = await fetchFacts(options.fetch, isbn);
    if (failed && row) return { found: toEdition(row) };
    const edition = merge(isbn, facts);
    if (!edition) {
      if (failed) return { unavailable: true };
      if (row && !chosen) return { found: toEdition(row) };
      db.prepare('insert or replace into miss (isbn, checked_at) values (?, ?)').run(isbn, now().toISOString());
      return row ? { found: toEdition(row) } : { notFound: true };
    }
    // An answer missing a source is not stored: the next lookup asks again.
    if (!failed) store(edition);
    return { found: edition };
  }

  // Adds the Volumes BnF lists for the Edition Line of `anchor` (CORE-31). A
  // BnF search by Series title and publisher also finds other books (One Piece
  // Color Walk, magazines, quiz books): an Edition counts when it has a Volume
  // number, the Series title, the publisher and the language of the line, and
  // the BnF Series record of the line. One Edition per Volume number: one the
  // Catalog has already, else the latest printing. Like a lookup, nothing is
  // stored when a source fails, so Work identifiers stay the ones a lookup gives.
  // Calls at the same time for one Edition Line share one fill.
  const filling = new Map<string, Promise<void>>();
  const failedAt = new Map<string, string>();

  function fillOnce(anchor: Edition & { series: Series }, line: string): Promise<void> {
    const running = filling.get(line) ?? fill(anchor, line).finally(() => filling.delete(line));
    filling.set(line, running);
    return running;
  }

  async function fill(anchor: Edition & { series: Series }, line: string): Promise<void> {
    const filled = db.prepare('select filled_at from line_fill where edition_line = ?').get(line) as { filled_at: string } | undefined;
    if ((filled && age(filled.filled_at) < fillTtlMs) || !anchor.publisher) return;
    const failed = failedAt.get(line);
    if (failed && age(failed) < fillRetryMs) return;
    const fail = (error: unknown) => {
      failedAt.set(line, now().toISOString());
      console.warn('Catalog source failed:', error instanceof Error ? error.message : error);
    };
    const known = db.prepare('select isbn, volume from edition where edition_line = ?').all(line) as { isbn: string; volume: number | null }[];
    const lineBnfId = (db.prepare('select bnf_id from series where id = ?').get(anchor.series.id) as { bnf_id: string | null } | undefined)
      ?.bnf_id;
    let listed: Listed[];
    try {
      listed = await bnfSearch(options.fetch, anchor.series.title, anchor.publisher);
    } catch (error) {
      return fail(error);
    }
    const inLine = listed.filter(
      ({ facts }) =>
        facts.volume !== undefined &&
        key(facts.series?.title ?? '') === key(anchor.series.title) &&
        key(facts.publisher ?? '') === key(anchor.publisher ?? '') &&
        facts.language === anchor.language,
    );
    // The line's BnF Series record, else the one most of these Editions name.
    const counts = new Map<string, number>();
    for (const { facts } of inLine) if (facts.series?.bnfId) counts.set(facts.series.bnfId, (counts.get(facts.series.bnfId) ?? 0) + 1);
    const bnfId = lineBnfId ?? [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    const byVolume = new Map<number, Listed>();
    const newer = (a: Listed, b: Listed) => (a.facts.series?.bnfId === bnfId) !== (b.facts.series?.bnfId === bnfId)
      ? a.facts.series?.bnfId === bnfId
      : (a.year ?? 0) > (b.year ?? 0);
    for (const each of inLine) {
      const theirs = each.facts.series?.bnfId;
      if (theirs && bnfId && theirs !== bnfId) continue;
      const volume = each.facts.volume!;
      const kept = byVolume.get(volume);
      if (!kept || newer(each, kept)) byVolume.set(volume, each);
    }
    const knownIsbns = new Set(known.map(({ isbn }) => isbn));
    const knownVolumes = new Set(known.map(({ volume }) => volume));
    const added = [...byVolume.values()].filter(({ isbn, facts }) => !knownIsbns.has(isbn) && !knownVolumes.has(facts.volume!));
    let fromInventaire: Map<string, Facts>;
    try {
      fromInventaire = await inventaireEditions(options.fetch, added.map(({ isbn }) => isbn));
    } catch (error) {
      return fail(error);
    }
    for (const { isbn, facts } of added) {
      const edition = merge(isbn, [facts, ...(fromInventaire.get(isbn) ? [fromInventaire.get(isbn)!] : [])]);
      // The Series this Catalog gives it must be the line's.
      if (edition && editionLine(edition) === line) store(edition);
    }
    db.prepare('insert or replace into line_fill (edition_line, filled_at) values (?, ?)').run(line, now().toISOString());
    failedAt.delete(line);
  }

  // A missing or unusable picture is not remembered: the next request asks again.
  async function cover(isbn: string): Promise<CoverLookup> {
    const result = await lookup(isbn);
    if (!('found' in result)) return result;
    const url = result.found.cover;
    if (!url || !isCoverUrl(url)) return { notFound: true };
    // Kept for this URL only: a refreshed Edition with another cover fetches it.
    const kept = db.prepare('select type, bytes from cover where isbn = ? and url = ?').get(isbn, url) as Cover | undefined;
    if (kept) return { found: kept };

    let found: Cover;
    try {
      const response = await options.fetch(url);
      if (response.status === 404) return { notFound: true };
      if (!response.ok) return { unavailable: true };
      const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
      if (!coverTypes.includes(type) || Number(response.headers.get('content-length')) > maxCoverBytes) return { notFound: true };
      found = { type, bytes: new Uint8Array(await response.arrayBuffer()) };
    } catch {
      return { unavailable: true };
    }
    if (found.bytes.byteLength > maxCoverBytes) return { notFound: true };
    db.prepare('insert or replace into cover (isbn, url, type, bytes) values (?, ?, ?, ?)').run(isbn, url, found.type, found.bytes);
    return { found };
  }

  async function search(title: string, publisher?: string): Promise<SearchFound | { unavailable: true }> {
    let listed: Listed[];
    try {
      listed = await bnfSearch(options.fetch, title, publisher, 50);
    } catch (error) {
      console.warn('Catalog source failed:', error instanceof Error ? error.message : error);
      return { unavailable: true };
    }
    const lines = new Map<string, { line: LineFound; best: Listed }>();
    const works: WorkFound[] = [];
    for (const each of listed) {
      const { facts, isbn, year } = each;
      const series = facts.series?.title;
      if (series && facts.volume !== undefined) {
        const id = [series, facts.publisher ?? '', facts.language ?? ''].map(key).join('|');
        const kept = lines.get(id);
        if (!kept) {
          lines.set(id, {
            line: { anchor: isbn, series, publisher: facts.publisher ?? null, language: facts.language ?? null, volumes: [facts.volume] },
            best: each,
          });
          continue;
        }
        if (!kept.line.volumes.includes(facts.volume)) kept.line.volumes.push(facts.volume);
        // The anchor is the last Volume, its latest printing.
        const [v, w] = [facts.volume, kept.best.facts.volume!];
        if (v > w || (v === w && (year ?? 0) > (kept.best.year ?? 0))) {
          kept.best = each;
          kept.line.anchor = isbn;
        }
      } else if (facts.title) {
        works.push({ anchor: isbn, title: facts.title, authors: facts.authors ?? [], publisher: facts.publisher ?? null, year: year ?? null });
      }
    }
    return {
      lines: [...lines.values()].slice(0, maxFound).map(({ line }) => ({ ...line, volumes: line.volumes.sort((a, b) => a - b) })),
      works: works.slice(0, maxFound),
    };
  }

  async function choose(isbn: string, choice: Choice): Promise<Chosen> {
    const known = await lookup(isbn);
    if ('unavailable' in known) return known;
    if ('found' in known && !isReader(known.found)) return { known: known.found };
    const anchored = await lookup(choice.anchor);
    if ('unavailable' in anchored) return anchored;
    if (!('found' in anchored)) return { badAnchor: 'unknown' };
    const anchor = anchored.found;
    if (choice.volume !== null && !anchor.series) return { badAnchor: 'no-series' };
    // A Work from another Edition only when sources share it (ADR 0010): an
    // `isbn:` Work is that other Edition's own.
    if (choice.volume === null && anchor.work.id === editionWork(anchor.isbn)) return { badAnchor: 'no-shared-work' };
    const edition: Edition = {
      isbn,
      title: choice.title,
      volumeTitle: null,
      authors: choice.authors.length ? choice.authors : anchor.authors,
      publisher: anchor.publisher,
      language: anchor.language,
      format: null,
      cover: null,
      work: choice.volume === null ? anchor.work : { id: editionWork(isbn), title: choice.title },
      series: choice.volume === null ? null : anchor.series,
      volume: choice.volume,
      sources: ['reader'],
      fetchedAt: now().toISOString(),
    };
    store(edition);
    // The sources are asked again a day later (lookup).
    db.prepare('insert or replace into miss (isbn, checked_at) values (?, ?)').run(isbn, edition.fetchedAt);
    return { found: edition };
  }

  return {
    lookup,
    cover,
    search,
    choose,
    async volumes(edition, { fill }) {
      const anchor = db.prepare('select edition_line from edition where isbn = ?').get(edition.isbn) as
        | { edition_line: string | null }
        | undefined;
      const line = anchor?.edition_line;
      if (!line || !edition.series) return [edition];
      if (fill) await fillOnce({ ...edition, series: edition.series }, line);
      const rows = db
        .prepare(`${selectEdition} where edition.edition_line = ? order by edition.volume is null, edition.volume, edition.isbn`)
        .all(line) as EditionRow[];
      return rows.map(toEdition);
    },
    close: () => db.close(),
  };
}

// Edition Line (ADR 0010): one Series, publisher and language. The sources
// give no format, only a size in cm that varies inside one line (One Piece 56
// "18 x 12 cm", 112 "19 cm"), so it is not part of the key. The key is
// internal and may change when the Catalog fixes its data.
function editionLine(edition: Edition): string | null {
  const { series } = edition;
  return series && [series.id, edition.publisher, edition.language].map((v) => key(v ?? '')).join('|');
}

function toEdition(row: EditionRow): Edition {
  return {
    isbn: row.isbn,
    title: row.title,
    volumeTitle: row.volume_title,
    authors: JSON.parse(row.authors) as string[],
    publisher: row.publisher,
    language: row.language,
    format: row.format,
    cover: row.cover,
    work: { id: row.work_id, title: row.work_title },
    series: row.series_id && row.series_title ? { id: row.series_id, title: row.series_title } : null,
    volume: row.volume,
    sources: JSON.parse(row.sources) as EditionSource[],
    fetchedAt: row.fetched_at,
  };
}

const isReader = (edition: Pick<Edition, 'sources'>) => edition.sources.includes('reader');

// Two titles name the same book when every word of the shorter one is in the
// longer one: "One Piece" and "One Piece 56", "Spy x family" and "Spy x Family - Tome 16".
function sameBook(a: string, b: string): boolean {
  const [shorter, longer] = [key(a).split(' '), key(b).split(' ')].sort((x, y) => x.length - y.length);
  return shorter.every((word) => longer.includes(word));
}

// Compares titles, publishers and formats: "Glénat" = "glenat", "One Piece" = "One piece",
// "Spy × Family" = "Spy x family".
function key(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/×/g, 'x')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const crockford = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function ulid(time: Date): string {
  let ms = time.getTime();
  let stamp = '';
  for (let i = 0; i < 10; i++, ms = Math.floor(ms / 32)) stamp = crockford[ms % 32] + stamp;
  const random = [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => crockford[byte % 32]).join('');
  return stamp + random;
}
