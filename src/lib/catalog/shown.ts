// The Editions as readers see them (ADR 0017): the source data, with each
// Series Correction laid over it. A Correction with an anchor is in the
// Series and Edition Line where the sources put the anchor. A Correction that
// keeps the Volume number keeps the Volumes the Edition holds: an omnibus
// moved to another line stays "Tomes 1-2".
// Editions with no Correction come straight from `edition`, so a query on
// the Edition Line, which SQLite passes into both parts, uses its index.
const sourceColumns = `e.isbn, e.title, e.volume_title, e.authors, e.publisher, e.language, e.format, e.cover,
    e.work_id, e.work_title, e.year, e.bnf_id, e.sources, e.fetched_at`;
export const shownEditions = `(select ${sourceColumns}, e.series, e.edition_line, e.volume, e.volumes, 0 as corrected
    from edition e where e.isbn not in (select isbn from series_correction)
  union all
  select ${sourceColumns},
    coalesce(c.series, a.series) as series,
    coalesce(c.edition_line, a.edition_line) as edition_line,
    c.volume as volume,
    iif(c.volume is null, '[]', iif(c.volume = e.volume, e.volumes, json_array(c.volume))) as volumes,
    1 as corrected
    from series_correction c join edition e on e.isbn = c.isbn left join edition a on a.isbn = c.anchor)`;
