// The Catalog (ADR 0004, 0007, 0010): answers "what is this ISBN?" from its own
// SQLite file, and asks the open sources only on a miss. It also serves covers,
// so the reader's browser never asks a source for one (ADR 0001). It stores
// books only: no reader identity, no Library data.
import { DatabaseSync } from 'node:sqlite';
import { editionWork } from '../library/ids';
import type { Facts, SourceName } from './facts';
import type { SourceFetch } from './sources';
import { fetchFacts, isCoverUrl } from './sources';

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
  sources: SourceName[];
  fetchedAt: string;
}

export type Lookup = { found: Edition } | { notFound: true } | { unavailable: true };

export interface Cover {
  type: string;
  bytes: Uint8Array<ArrayBuffer>;
}

export type CoverLookup = { found: Cover } | { notFound: true } | { unavailable: true };

export interface Catalog {
  lookup(isbn: string): Promise<Lookup>;
  // The Volumes this Catalog knows in the Edition Line of `anchor` (ADR 0010),
  // by Volume number. Only `anchor` when it has no Series.
  volumes(anchor: Edition): Edition[];
  // The cover of the Edition, fetched once from its source and kept.
  cover(isbn: string): Promise<CoverLookup>;
  close(): void;
}

// Sources add Series links to recent records months later (spike 0002): fetch
// an Edition again after a month, and an unknown ISBN again after a day.
const editionTtlMs = 30 * 24 * 3600 * 1000;
const missTtlMs = 24 * 3600 * 1000;

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
  // whose title matches the best source's title are merged.
  function merge(isbn: string, all: Facts[]): Edition | undefined {
    const title = all.find((f) => f.title)?.title;
    if (!title) return undefined;
    const facts = all.filter((f) => f.title && sameBook(f.title, title));
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
    // Edition Line (ADR 0010): one Series, publisher and language. The sources
    // give no format, only a size in cm that varies inside one line (One Piece
    // 56 "18 x 12 cm", 112 "19 cm"), so it is not part of the key. The key is
    // internal and may change when the Catalog fixes its data.
    const line = series && [series.id, edition.publisher, edition.language].map((v) => key(v ?? '')).join('|');
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

  async function lookup(isbn: string): Promise<Lookup> {
    const row = editionRow(isbn);
    if (row && age(row.fetched_at) < editionTtlMs) return { found: toEdition(row) };
    const miss = db.prepare('select checked_at from miss where isbn = ?').get(isbn) as { checked_at: string } | undefined;
    if (!row && miss && age(miss.checked_at) < missTtlMs) return { notFound: true };

    const { facts, failed } = await fetchFacts(options.fetch, isbn);
    if (failed && row) return { found: toEdition(row) };
    const edition = merge(isbn, facts);
    if (!edition) {
      if (row) return { found: toEdition(row) };
      if (failed) return { unavailable: true };
      db.prepare('insert or replace into miss (isbn, checked_at) values (?, ?)').run(isbn, now().toISOString());
      return { notFound: true };
    }
    // An answer missing a source is not stored: the next lookup asks again.
    if (!failed) store(edition);
    return { found: edition };
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

  return {
    lookup,
    cover,
    volumes(edition) {
      const anchor = db.prepare('select edition_line from edition where isbn = ?').get(edition.isbn) as
        | { edition_line: string | null }
        | undefined;
      if (!anchor?.edition_line) return [edition];
      const rows = db
        .prepare(`${selectEdition} where edition.edition_line = ? order by edition.volume is null, edition.volume, edition.isbn`)
        .all(anchor.edition_line) as EditionRow[];
      return rows.map(toEdition);
    },
    close: () => db.close(),
  };
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
    sources: JSON.parse(row.sources) as SourceName[],
    fetchedAt: row.fetched_at,
  };
}

// Two titles name the same book when every word of the shorter one is in the
// longer one: "One Piece" and "One Piece 56", "Spy x family" and "Spy x Family - Tome 16".
function sameBook(a: string, b: string): boolean {
  const [shorter, longer] = [key(a).split(' '), key(b).split(' ')].sort((x, y) => x.length - y.length);
  return shorter.every((word) => longer.includes(word));
}

// Compares titles, publishers and formats: "Glénat" = "glenat", "One Piece" = "One piece".
function key(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const crockford = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function ulid(time: Date): string {
  let ms = time.getTime();
  let stamp = '';
  for (let i = 0; i < 10; i++, ms = Math.floor(ms / 32)) stamp = crockford[ms % 32] + stamp;
  const random = [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => crockford[byte % 32]).join('');
  return stamp + random;
}
