// The Catalog (ADR 0004, 0007, 0010): answers "what is this ISBN?" from its own
// SQLite file, and asks the open sources only on a miss. It also serves covers,
// so the reader's browser never asks a source for one (ADR 0001). It stores
// books only: no reader identity, no Library data.
import { DatabaseSync } from 'node:sqlite';
import { editionWork, seriesIdRank } from '../library/ids';
import { key, seriesKey, type Facts, type SourceName } from './facts';
import { bookHeight, lineHeight, lineKey, linePrefix, placeLine, sameSize } from './lines';
import { inTransaction, migrate } from './migrations';
import type { SourceFetch } from './sources';
import { bnfSearch, fetchFacts, inventaireEditions, isCoverUrl, type Listed } from './sources';

// `id` is the best identifier the Catalog knows (ADR 0010 order); `sameAs`
// holds the others that name the same Series, oldest first.
export type Series = { id: string; title: string; sameAs: string[] };

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
  // The Volumes the Edition holds, in order: several for an omnibus ("Tomes
  // 1-2"), none when it has no Volume number.
  volumes: number[];
  // The first of `volumes`, for clients that know one Volume per Edition.
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
  // The Series of an identifier, its main one or a same_as one (ADR 0010);
  // undefined when this Catalog does not know it.
  series(id: string): Series | undefined;
  // Links two identifiers of one Series when no source does ("Aterix" in
  // SUDOC is Asterix): one Series keeps the best identifier, its title and
  // every Volume of both. Undefined when either identifier is unknown here.
  link(a: string, b: string): Series | undefined;
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
  same_as: string | null;
  volume: number | null;
  volumes: string | null;
  sources: string;
  fetched_at: string;
};

// Every identifier of a Series but its main one, oldest link first.
const sameAsOf = (n: string) =>
  `(select json_group_array(id) from (select id from series_link where series = ${n} and id != series.id order by rowid))`;
const selectEdition = `select edition.*, series.id as series_id, series.title as series_title, ${sameAsOf('series.n')} as same_as
  from edition left join series on series.n = edition.series`;
const selectSeries = `select series.n, series.id, series.title, series.bnf_id, ${sameAsOf('series.n')} as same_as from series`;

type SeriesRow = { n: number; id: string; title: string; bnf_id: string | null; same_as: string };

const toSeries = (row: SeriesRow): Series => ({ id: row.id, title: row.title, sameAs: JSON.parse(row.same_as) as string[] });
const minted = (id: string) => id.startsWith('atomes:');

// `host` mints `atomes:<host>:<ULID>` Series identifiers when no source has one.
export function createCatalog(options: { file: string; fetch: SourceFetch; host: string; now?: () => Date }): Catalog {
  const now = options.now ?? (() => new Date());
  const db = new DatabaseSync(options.file);
  // WAL: the hourly backup reads a snapshot while the server keeps writing (docs/backups.md).
  db.exec('pragma journal_mode = wal');
  migrate(db);

  const editionRow = (isbn: string) => db.prepare(`${selectEdition} where edition.isbn = ?`).get(isbn) as EditionRow | undefined;
  const age = (iso: string) => now().getTime() - Date.parse(iso);

  const seriesRow = (where: string, value: string | number) =>
    db.prepare(`${selectSeries} where ${where}`).get(value) as SeriesRow | undefined;
  const seriesRows = (where: string, value: string) =>
    db.prepare(`${selectSeries} where ${where} order by series.n`).all(value) as SeriesRow[];
  const byIdentifier = (id: string) => seriesRow('series.n = (select series from series_link where id = ?)', id);
  const addTitleKey = (n: number, title: string) =>
    db.prepare('insert or ignore into series_title (title_key, series) values (?, ?)').run(seriesKey(title), n);

  // The Series of these facts, made or found, then linked (ADR 0010): an
  // identifier never changes once a record uses it, so a shared identifier
  // that comes after a minted one becomes the main identifier, and the minted
  // one a same_as link. The title is the shared source's label (Wikidata,
  // Inventaire); every older title key still finds the Series.
  function seriesFor(facts: Facts[]): Series | null {
    const found = facts.find((f) => f.series?.id && f.series.title)?.series;
    const shared = found?.id && found.title ? { id: found.id, title: found.title } : undefined;
    const titles = facts.flatMap((f) => (f.series?.title ? [f.series.title] : []));
    const title = shared?.title ?? titles[0];
    if (!title) return null;
    const bnfId = facts.find((f) => f.series?.bnfId)?.series?.bnfId ?? null;
    return inTransaction(db, () => {
      const byId = shared && byIdentifier(shared.id);
      // A Series with another shared identifier is another Series, even with the same title.
      const joinable = (row: SeriesRow) => !shared || minted(row.id) || row.n === byId?.n;
      const other =
        (bnfId ? seriesRows('series.bnf_id = ?', bnfId) : []).find(joinable) ??
        [title, ...titles]
          .flatMap((each) => seriesRows('series.n in (select series from series_title where title_key = ?)', seriesKey(each)))
          .find(joinable);

      let n: number;
      if (!byId && !other) {
        const id = shared?.id ?? `atomes:${options.host}:${ulid(now())}`;
        n = Number(db.prepare('insert into series (id, title, bnf_id) values (?, ?, ?)').run(id, title, bnfId).lastInsertRowid);
        db.prepare('insert into series_link (id, series) values (?, ?)').run(id, n);
      } else if (byId) {
        n = byId.n;
        if (other && other.n !== n) n = mergeSeries(byId, other);
      } else {
        n = other!.n;
        if (shared) {
          db.prepare('insert into series_link (id, series) values (?, ?)').run(shared.id, n);
          db.prepare('update series set id = ? where n = ?').run(shared.id, n);
        }
      }
      if (shared) db.prepare('update series set title = ? where n = ?').run(shared.title, n);
      if (bnfId) db.prepare('update series set bnf_id = ? where n = ? and bnf_id is null').run(bnfId, n);
      for (const each of new Set([title, ...titles])) addTitleKey(n, each);
      return toSeries(seriesRow('series.n = ?', n)!);
    });
  }

  // One Series from two: the one with the best main identifier (ADR 0010
  // order, then the oldest) keeps its identifier and title, and takes every
  // identifier, title key and Edition of the other. Gives the Series kept.
  function mergeSeries(a: SeriesRow, b: SeriesRow): number {
    const [keep, drop] = [a, b].sort((x, y) => seriesIdRank(x.id) - seriesIdRank(y.id) || x.n - y.n);
    db.prepare('update series_link set series = ? where series = ?').run(keep.n, drop.n);
    db.prepare('insert or ignore into series_title (title_key, series) select title_key, ? from series_title where series = ?').run(
      keep.n,
      drop.n,
    );
    db.prepare('delete from series_title where series = ?').run(drop.n);
    db.prepare('update series set bnf_id = ? where n = ? and bnf_id is null').run(drop.bnf_id, keep.n);
    // Its Editions move to the kept Series' Edition Lines; their old fills are forgotten.
    const editions = db.prepare('select isbn, publisher, language, edition_line from edition where series = ?').all(drop.n) as {
      isbn: string;
      publisher: string | null;
      language: string | null;
      edition_line: string;
    }[];
    for (const each of editions) {
      db.prepare('delete from line_fill where edition_line = ?').run(each.edition_line);
      const line = lineKey(linePrefix(keep.n, each), lineHeight(each.edition_line));
      db.prepare('update edition set series = ?, edition_line = ? where isbn = ?').run(keep.n, line, each.isbn);
    }
    db.prepare('delete from series where n = ?').run(drop.n);
    return keep.n;
  }

  function link(a: string, b: string): Series | undefined {
    const [first, second] = [byIdentifier(a), byIdentifier(b)];
    if (!first || !second) return undefined;
    if (first.n === second.n) return toSeries(first);
    return toSeries(seriesRow('series.n = ?', inTransaction(db, () => mergeSeries(first, second)))!);
  }

  // Edition Line (ADR 0010): one Series, publisher, language and book size.
  const prefixOf = (edition: Edition) => {
    const series = edition.series && byIdentifier(edition.series.id);
    return series ? linePrefix(series.n, edition) : null;
  };
  const lineAt = (isbn: string) =>
    (db.prepare('select edition_line from edition where isbn = ?').get(isbn) as { edition_line: string | null } | undefined)?.edition_line ?? null;

  // An Edition stays in its line while its Series and size fit it; else it
  // joins the line of its size (lines.ts).
  function lineOf(edition: Edition): string | null {
    const prefix = prefixOf(edition);
    if (!prefix) return null;
    const height = bookHeight(edition.format);
    const current = lineAt(edition.isbn);
    if (current?.startsWith(`${prefix}|`) && sameSize(height, lineHeight(current))) return current;
    const lines = db
      .prepare('select edition_line as line, count(*) as editions from edition where substr(edition_line, 1, ?) = ? group by edition_line')
      .all(prefix.length + 1, `${prefix}|`) as { line: string; editions: number }[];
    return placeLine(prefix, height, lines);
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
    const volumes = pick((f) => (f.volumes?.length ? f.volumes : undefined)) ?? [];
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
      volumes,
      volume: volumes[0] ?? null,
      sources: facts.map((f) => f.source),
      fetchedAt: now().toISOString(),
    };
    return edition;
  }

  function store(edition: Edition, line = lineOf(edition)): void {
    const series = edition.series && byIdentifier(edition.series.id);
    db.prepare(
      `insert or replace into edition (isbn, title, volume_title, authors, publisher, language, format, cover, work_id,
        work_title, series, volume, volumes, edition_line, sources, fetched_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      series?.n ?? null,
      edition.volume,
      JSON.stringify(edition.volumes),
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
  // number, the Series title, the publisher, the language and the book size of
  // the line (ADR 0010, amendment 2026-11-12). The BnF Series record of the
  // line counts only when the anchor or the Edition is an omnibus: One Piece's
  // single Volumes name four records. One Edition per Volume or omnibus range
  // ("1-2" next to Volumes 1 and 2): one the Catalog has already, else one in
  // the line's record (quiz books and box sets of the same size have their
  // own), else the latest printing. Like a lookup, nothing is stored when a
  // source fails, so Work identifiers stay the ones a lookup gives.
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
    const known = (db.prepare(`${selectEdition} where edition.edition_line = ?`).all(line) as EditionRow[]).map(toEdition);
    let listed: Listed[];
    try {
      listed = await bnfSearchEverySpelling(options.fetch, anchor.series.title, anchor.publisher);
    } catch (error) {
      return fail(error);
    }
    const height = lineHeight(line);
    const inSeries = listed.filter(
      ({ facts }) =>
        facts.volumes?.length &&
        seriesKey(facts.series?.title ?? '') === seriesKey(anchor.series.title) &&
        key(facts.publisher ?? '') === key(anchor.publisher ?? '') &&
        facts.language === anchor.language &&
        sameSize(bookHeight(facts.format), height),
    );
    // The line's BnF Series record: the one most Editions of the anchor's kind
    // (omnibus or single Volume) name, whatever Volume was looked up first.
    const omnibus = (volumes: number[] | undefined) => (volumes?.length ?? 0) > 1;
    const counts = new Map<string, number>();
    for (const { facts } of inSeries)
      if (facts.series?.bnfId && omnibus(facts.volumes) === omnibus(anchor.volumes))
        counts.set(facts.series.bnfId, (counts.get(facts.series.bnfId) ?? 0) + 1);
    const bnfId = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    const byVolume = new Map<string, Listed>();
    const newer = (a: Listed, b: Listed) => (a.facts.series?.bnfId === bnfId) !== (b.facts.series?.bnfId === bnfId)
      ? a.facts.series?.bnfId === bnfId
      : (a.year ?? 0) > (b.year ?? 0);
    for (const each of inSeries) {
      const theirs = each.facts.series?.bnfId;
      const checked = omnibus(each.facts.volumes) || omnibus(anchor.volumes);
      if (checked && theirs && bnfId && theirs !== bnfId) continue;
      const volume = String(each.facts.volumes);
      const kept = byVolume.get(volume);
      if (!kept || newer(each, kept)) byVolume.set(volume, each);
    }
    const knownIsbns = new Set(known.map(({ isbn }) => isbn));
    const knownVolumes = new Set(known.map(({ volumes }) => String(volumes)));
    const added = [...byVolume].filter(([volume, { isbn }]) => !knownIsbns.has(isbn) && !knownVolumes.has(volume)).map(([, each]) => each);
    let fromInventaire: Map<string, Facts>;
    try {
      fromInventaire = await inventaireEditions(options.fetch, added.map(({ isbn }) => isbn));
    } catch (error) {
      return fail(error);
    }
    for (const { isbn, facts } of added) {
      const edition = merge(isbn, [facts, ...(fromInventaire.get(isbn) ? [fromInventaire.get(isbn)!] : [])]);
      // The Series this Catalog gives it must be the line's; the size was checked above.
      const prefix = edition && prefixOf(edition);
      if (edition && prefix && line.startsWith(`${prefix}|`)) store(edition, line);
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
      ({ listed } = await bnfSearch(options.fetch, title, publisher, 50));
    } catch (error) {
      console.warn('Catalog source failed:', error instanceof Error ? error.message : error);
      return { unavailable: true };
    }
    const lines = new Map<string, { line: LineFound; best: Listed }>();
    const works: WorkFound[] = [];
    for (const each of listed) {
      const { facts, isbn, year } = each;
      const series = facts.series?.title;
      if (series && facts.volumes?.length) {
        const id = [series, facts.publisher ?? '', facts.language ?? ''].map(key).join('|');
        const kept = lines.get(id);
        if (!kept) {
          lines.set(id, {
            line: { anchor: isbn, series, publisher: facts.publisher ?? null, language: facts.language ?? null, volumes: [...facts.volumes] },
            best: each,
          });
          continue;
        }
        for (const volume of facts.volumes) if (!kept.line.volumes.includes(volume)) kept.line.volumes.push(volume);
        // The anchor is the last Volume, its latest printing.
        const [v, w] = [facts.volumes.at(-1)!, kept.best.facts.volumes!.at(-1)!];
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
      volumes: choice.volume === null ? [] : [choice.volume],
      volume: choice.volume,
      sources: ['reader'],
      fetchedAt: now().toISOString(),
    };
    // A chosen Volume joins the Edition Line of its anchor, whatever its size.
    store(edition, edition.series ? (lineAt(anchor.isbn) ?? lineOf(edition)) : null);
    // The sources are asked again a day later (lookup).
    db.prepare('insert or replace into miss (isbn, checked_at) values (?, ?)').run(isbn, edition.fetchedAt);
    return { found: edition };
  }

  return {
    lookup,
    cover,
    search,
    choose,
    link,
    series: (id) => {
      const row = byIdentifier(id);
      return row && toSeries(row);
    },
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
    series:
      row.series_id && row.series_title
        ? { id: row.series_id, title: row.series_title, sameAs: JSON.parse(row.same_as ?? '[]') as string[] }
        : null,
    volumes: row.volumes ? (JSON.parse(row.volumes) as number[]) : row.volume === null ? [] : [row.volume],
    volume: row.volume,
    sources: JSON.parse(row.sources) as EditionSource[],
    fetchedAt: row.fetched_at,
  };
}

const isReader = (edition: Pick<Edition, 'sources'>) => edition.sources.includes('reader');

// BnF files one Series under several spellings: SUDOC's "Dragonball" finds
// BnF's Series records titled "Dragon Ball", and only "Dragon Ball" finds the
// 18 cm Volumes. Each title of the first answer that differs from `title` only
// by spaces is searched once more, with no further round (CORE-70). An ISBN
// both answers list is harmless: the fill keeps one Edition per Volume.
async function bnfSearchEverySpelling(fetch: SourceFetch, title: string, publisher: string): Promise<Listed[]> {
  const first = await bnfSearch(fetch, title, publisher);
  const spellings = new Map<string, string>();
  for (const each of first.titles)
    if (seriesKey(each) === seriesKey(title) && key(each) !== key(title)) spellings.set(key(each), each);
  const listed = first.listed;
  for (const spelling of spellings.values()) listed.push(...(await bnfSearch(fetch, spelling, publisher)).listed);
  return listed;
}

// Two titles name the same book when every word of the shorter one is in the
// longer one: "One Piece" and "One Piece 56", "Spy x family" and "Spy x Family - Tome 16".
function sameBook(a: string, b: string): boolean {
  const [shorter, longer] = [key(a).split(' '), key(b).split(' ')].sort((x, y) => x.length - y.length);
  return shorter.every((word) => longer.includes(word));
}

const crockford = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function ulid(time: Date): string {
  let ms = time.getTime();
  let stamp = '';
  for (let i = 0; i < 10; i++, ms = Math.floor(ms / 32)) stamp = crockford[ms % 32] + stamp;
  const random = [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => crockford[byte % 32]).join('');
  return stamp + random;
}
