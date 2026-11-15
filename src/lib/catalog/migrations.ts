// The schema of the Catalog file, one step per change. Reader records hold
// `atomes:` identifiers that this file minted (ADR 0010), so the file is not a
// cache that can be thrown away: change the schema with a new step at the end
// of `steps`, never by editing a step that has run. `pragma user_version`
// counts the steps a file has run; each step runs in one transaction.
import type { DatabaseSync } from 'node:sqlite';
import { key } from './facts';
import { bookHeight, placeLine } from './lines';
import { dropSharedWorks } from './shared-works';

type Step = (db: DatabaseSync) => void;

// Catalog v0 (CORE-27, CORE-31). Files made before steps existed have
// user_version 0 and these tables already.
const catalogV0: Step = (db) =>
  db.exec(`
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
  `);

// CORE-42, same_as: a Series is an internal number `n`, with every identifier
// that names it in `series_link` (its main one, `series.id`, and its same_as
// ones) and every title key that finds it in `series_title`. Editions and the
// Edition Line key point at `n`, so linking an identifier changes no Edition.
const sameAs: Step = (db) => {
  db.exec(`
    alter table series rename to series_v0;
    create table series (
      n integer primary key,
      id text not null unique,
      title text not null,
      bnf_id text
    );
    insert into series (id, title, bnf_id) select id, title, bnf_id from series_v0 order by rowid;
    create index series_bnf_id on series (bnf_id);
    create table series_link (
      id text primary key,
      series integer not null references series (n)
    );
    insert into series_link (id, series) select id, n from series order by n;
    create table series_title (
      title_key text not null,
      series integer not null references series (n),
      primary key (title_key, series)
    );
    insert into series_title (title_key, series) select v.title_key, s.n from series_v0 v join series s on s.id = v.id;
    create index series_title_series on series_title (series);

    alter table edition rename to edition_v0;
    create table edition (
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
      series integer references series (n),
      volume real,
      edition_line text,
      sources text not null,
      fetched_at text not null
    );
    insert into edition select e.isbn, e.title, e.volume_title, e.authors, e.publisher, e.language, e.format, e.cover,
      e.work_id, e.work_title, s.n, e.volume, e.edition_line, e.sources, e.fetched_at
      from edition_v0 e left join series s on s.id = e.series_id;
    drop table edition_v0;
    drop table series_v0;
    create index edition_line on edition (edition_line);
  `);
  // The Edition Line key held the Series identifier; it now holds `n`.
  type Row = { isbn: string; series: number; publisher: string | null; language: string | null; edition_line: string };
  const rows = db.prepare('select isbn, series, publisher, language, edition_line from edition where series is not null').all() as Row[];
  const moved = new Map<string, string>();
  for (const row of rows) {
    const line = [String(row.series), row.publisher, row.language].map((v) => key(v ?? '')).join('|');
    db.prepare('update edition set edition_line = ? where isbn = ?').run(line, row.isbn);
    moved.set(row.edition_line, line);
  }
  for (const [old, line] of moved) db.prepare('update line_fill set edition_line = ? where edition_line = ?').run(line, old);
};

// CORE-41, omnibus Volumes: an Edition holds the JSON list of its Volumes
// ("Tomes 1-2" is [1, 2]). Editions stored before have no list: they are
// fetched again on their next lookup, and keep their one Volume until then.
const omnibusVolumes: Step = (db) =>
  db.exec(`
    alter table edition add column volumes text;
    update edition set fetched_at = '${new Date(0).toISOString()}';
  `);

// CORE-58, book size (ADR 0010, amendment 2026-11-12): the Edition Line key
// ends with the line's book size, so Editions 2 cm or more apart split. Each
// old line splits from its oldest Edition, the one a reader looked up before
// the fill, then Editions with no size join the biggest part. Every line then
// fills again once: its past fill may hold Volumes of another size.
const lineSizes: Step = (db) => {
  type Row = { isbn: string; edition_line: string; format: string | null };
  const rows = db.prepare('select isbn, edition_line, format from edition where edition_line is not null order by rowid').all() as Row[];
  const parts = new Map<string, { line: string; editions: number }[]>();
  const place = (row: Row, height: number | undefined) => {
    const lines = parts.get(row.edition_line) ?? [];
    parts.set(row.edition_line, lines);
    const line = placeLine(row.edition_line, height, lines);
    const part = lines.find((each) => each.line === line);
    if (part) part.editions++;
    else lines.push({ line, editions: 1 });
    db.prepare('update edition set edition_line = ? where isbn = ?').run(line, row.isbn);
  };
  const sized = rows.map((row) => [row, bookHeight(row.format)] as const);
  for (const [row, height] of sized) if (height !== undefined) place(row, height);
  for (const [row, height] of sized) if (height === undefined) place(row, undefined);
  db.exec('delete from line_fill');
};

// Series title keys ignore spaces, so "Dragonball" finds "Dragon Ball" (ADR
// 0010 amendment, CORE-70). Two Series that now share a key stay two: the owner
// links them (scripts/link-series.ts). Every Edition Line fills again, with
// the BnF search by each spelling.
const titleKeysWithoutSpaces: Step = (db) => {
  db.exec(`
    insert or ignore into series_title (title_key, series) select replace(title_key, ' ', ''), series from series_title;
    delete from series_title where title_key like '% %';
    delete from line_fill;
  `);
};

// One publisher under two names is one Edition Line (ADR 0010 amendment
// 2026-11-13): every Edition Line fills again, with the BnF search by each word
// of a joint publisher name ("Dargaud Bénélux-Kana", then "Kana").
const forgetFills: Step = (db) => db.exec('delete from line_fill');

// One Work per Volume number (ADR 0010 amendment 2026-11-14, CORE-92): the
// Works sources gave to Editions of different Volume numbers in one Series are
// dropped for that Series, and remembered (shared-works.ts). Reader records
// that name them are repaired once by scripts/repair-shared-works.ts.
const oneWorkPerVolume: Step = (db) => {
  db.exec(`
    create table if not exists dropped_work (
      work_id text not null,
      series integer not null references series (n),
      primary key (work_id, series)
    );
  `);
  const rows = db.prepare('select distinct series from edition where series is not null').all() as { series: number }[];
  for (const { series } of rows) dropSharedWorks(db, series);
};

// Overlapping BnF Series records are separate Edition Lines, named by their
// years (ADR 0010 amendment 2026-11-14, CORE-95): an Edition keeps its year
// and its BnF Series record, and the Edition Line key ends with the record
// that names the line (empty until a fill knows it). Which lines mix records
// is not known before a fill, so every Edition Line fills again; the fill
// gives the listed Editions their year and record, and moves them.
const lineRecords: Step = (db) => {
  db.exec(`
    alter table edition add column year integer;
    alter table edition add column bnf_id text;
    update edition set edition_line = edition_line || '|'
      where edition_line is not null and length(edition_line) - length(replace(edition_line, '|', '')) = 3;
    delete from line_fill;
  `);
};

// Series Corrections (ADR 0017, CORE-103): a reader's Series, Edition Line
// and Volume number for one Edition, laid over the source data of `edition`
// on every read, so a fill never overwrites one and deleting it gives the
// source data back. The Edition joins the Edition Line of `anchor` (an ISBN
// in it), or, for a Series made by hand, the line `edition_line` of `series`.
// `account` and `created_at` let the owner find a wrong Correction; they never
// leave the instance.
const seriesCorrections: Step = (db) =>
  db.exec(`
    create table if not exists series_correction (
      isbn text primary key,
      anchor text,
      series integer references series (n),
      edition_line text,
      volume real,
      account text not null,
      created_at text not null,
      check ((anchor is not null and series is null and edition_line is null) or (anchor is null and series is not null and edition_line is not null))
    );
    create index if not exists series_correction_anchor on series_correction (anchor);
  `);

// Add a step at the end; never edit or remove one.
const steps: Step[] = [
  catalogV0,
  sameAs,
  omnibusVolumes,
  lineSizes,
  titleKeysWithoutSpaces,
  forgetFills,
  oneWorkPerVolume,
  lineRecords,
  seriesCorrections,
];

export function migrate(db: DatabaseSync): void {
  const { user_version: done } = db.prepare('pragma user_version').get() as { user_version: number };
  for (let i = done; i < steps.length; i++) {
    inTransaction(db, () => {
      steps[i](db);
      db.exec(`pragma user_version = ${i + 1}`);
    });
  }
}

// All of `run` is written, or nothing.
export function inTransaction<T>(db: DatabaseSync, run: () => T): T {
  db.exec('begin');
  try {
    const result = run();
    db.exec('commit');
    return result;
  } catch (error) {
    db.exec('rollback');
    throw error;
  }
}
