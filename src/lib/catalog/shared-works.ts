// One Work per Volume number (ADR 0010, amendment 2026-11-14): Inventaire
// gives one Work to 19 Volumes of Dragon Ball (1993), so one Copy would own
// them all and one Reading Status would change them all. When a source gives
// one Work to Editions of different Volume numbers in one Series, the Catalog
// drops that Work for that Series: each of its Editions gets `isbn:<isbn>`.
// The dropped Work is remembered (`dropped_work`), so it stays dropped when
// an Edition is fetched again and the source gives it back, and for every
// Edition of the Series stored later, reprints included: nothing tells which
// Volume the Work was meant for.
import type { DatabaseSync } from 'node:sqlite';

// Editions of one Volume number (reprints, other Edition Lines) share a Work,
// and so does an omnibus with each Volume it covers: only Editions that hold
// no Volume number in common are different Volumes. An Edition with no Volume
// number tells nothing.
export function acrossVolumes(volumes: number[][]): boolean {
  const numbered = volumes.filter((each) => each.length > 0);
  return numbered.some((a, i) => numbered.slice(i + 1).some((b) => !a.some((volume) => b.includes(volume))));
}

type Row = { isbn: string; work_id: string; volume: number | null; volumes: string | null };

const volumesOf = (row: Pick<Row, 'volume' | 'volumes'>) =>
  row.volumes ? (JSON.parse(row.volumes) as number[]) : row.volume === null ? [] : [row.volume];

// Drops, for Series `series`, every Work its stored Editions share across
// Volume numbers, and gives each Edition of a dropped Work its own Work.
export function dropSharedWorks(db: DatabaseSync, series: number): void {
  const rows = db
    .prepare("select isbn, work_id, volume, volumes from edition where series = ? and work_id not like 'isbn:%'")
    .all(series) as Row[];
  const byWork = new Map<string, number[][]>();
  for (const row of rows) byWork.set(row.work_id, [...(byWork.get(row.work_id) ?? []), volumesOf(row)]);
  for (const [work, volumes] of byWork)
    if (acrossVolumes(volumes)) db.prepare('insert or ignore into dropped_work (work_id, series) values (?, ?)').run(work, series);
  db.prepare(
    `update edition set work_id = 'isbn:' || isbn, work_title = title
     where series = ? and work_id in (select work_id from dropped_work where series = ?)`,
  ).run(series, series);
}

// Whether an Edition not stored yet would lose its Work in Series `series`.
export function losesWork(db: DatabaseSync, series: number, edition: { isbn: string; work: { id: string }; volumes: number[] }): boolean {
  if (edition.work.id.startsWith('isbn:')) return false;
  if (db.prepare('select 1 from dropped_work where work_id = ? and series = ?').get(edition.work.id, series)) return true;
  const others = db
    .prepare('select volume, volumes from edition where series = ? and work_id = ? and isbn != ?')
    .all(series, edition.work.id, edition.isbn) as Pick<Row, 'volume' | 'volumes'>[];
  return acrossVolumes([edition.volumes, ...others.map(volumesOf)]);
}
