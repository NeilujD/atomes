// The Editions as readers see them (ADR 0017): the source data, with each
// Series Correction laid over it. A Correction with an anchor is in the
// Series and Edition Line where the sources put the anchor.
export const shownEditions = `(select e.isbn, e.title, e.volume_title, e.authors, e.publisher, e.language, e.format, e.cover,
    e.work_id, e.work_title, e.year, e.bnf_id, e.sources, e.fetched_at,
    iif(c.isbn is null, e.series, coalesce(c.series, a.series)) as series,
    iif(c.isbn is null, e.edition_line, coalesce(c.edition_line, a.edition_line)) as edition_line,
    iif(c.isbn is null, e.volume, c.volume) as volume,
    iif(c.isbn is null, e.volumes, iif(c.volume is null, '[]', json_array(c.volume))) as volumes,
    c.isbn is not null as corrected
  from edition e left join series_correction c on c.isbn = e.isbn left join edition a on a.isbn = c.anchor)`;
