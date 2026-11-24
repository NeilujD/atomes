// Asks the real book sources about some ISBNs, the way the Catalog does, and
// saves every answer in src/lib/catalog/fixtures/ for the tests. Prints what
// each source says, to check the Catalog on real ISBNs (CORE-27 staging check).
//
// Usage: bun scripts/record-catalog-answers.ts 9782723478991 9791042021030
//        bun scripts/record-catalog-answers.ts --fill 9791042021030
//        bun scripts/record-catalog-answers.ts --search "Kaamelott" "Casterman"
//        bun scripts/record-catalog-answers.ts --find "Dix petits nègres"
//        bun scripts/record-catalog-answers.ts --series wd:Q42490 7
// `--fill` also records the BnF search and Inventaire answers that list the
// whole Edition Line of each ISBN (Catalog `volumes`). `--search` records the
// BnF search by a typed title and an optional publisher (Catalog `search`).
// `--find` records a Search by title or author words (ADR 0021, Catalog
// `find`) and the Editions of its first Work (Catalog `editions`). When the
// Search finds an Author, it also records the first 2 pages of their Works
// (Catalog `authorWorks`), and the Editions of the first Work of page 1
// instead. A Series row prints its Edition Lines: record the Volumes of one
// with `--fill <anchor>`.
// Review the diff before committing: answers change when the sources fix data.
import { writeFile } from 'node:fs/promises';
import { createCatalog } from '../src/lib/catalog/catalog';
import { fixtureDir, fixtureName } from '../src/lib/catalog/recorded.fake';
import type { WorkResult } from '../src/lib/catalog/search';
import type { SourceFetch } from '../src/lib/catalog/sources';
import { bnfSearch, fetchFacts, politeFetch } from '../src/lib/catalog/sources';

const real = politeFetch('Atomes/record (+https://github.com/NeilujD/atomes)', 1100, 60_000);
const recording: SourceFetch = async (url) => {
  const response = await real(url);
  const body = await response.text();
  console.log(response.status, url);
  if (response.ok) await writeFile(new URL(fixtureName(url), fixtureDir), body);
  return new Response(body, { status: response.status });
};

if (process.argv[2] === '--search') {
  const [title, publisher] = process.argv.slice(3);
  const { listed } = await bnfSearch(recording, title, publisher, 50);
  console.log(listed.map(({ isbn, facts, year }) => `${isbn} ${year} ${facts.series?.title} ${facts.volumes?.join('-')} | ${facts.title} | ${facts.publisher}`).join('\n'));
  process.exit(0);
}

if (process.argv[2] === '--find') {
  const catalog = createCatalog({ file: ':memory:', fetch: recording, host: 'record.local', accounts: { findDid: () => undefined } });
  const found = await catalog.find(process.argv[3]);
  if ('unavailable' in found) throw new Error('A source failed');
  const row = (each: WorkResult) => `${each.id} ${each.also.join(',')} | ${each.title} | ${each.authors.join(', ')} | ${each.year}`;
  console.log(found.works.map(row).join('\n'));
  console.log(found.authors.map(({ id, name, birthYear, works }) => `Author ${id} | ${name} | ${birthYear} | ${works} Works`).join('\n'));
  for (const { id, title, lines } of found.series)
    console.log(`Series ${id} | ${title}\n${lines.map(({ publisher, first, last, language }) => `  ${publisher} | ${first}–${last} | ${language}`).join('\n')}`);
  let first = found.works[0];
  const author = found.authors[0];
  if (author) {
    for (const page of [1, 2]) {
      const works = await catalog.authorWorks(author.id, page);
      if ('unavailable' in works) throw new Error('A source failed');
      console.log(`${author.name}, page ${page} of ${Math.ceil(works.total / 20)}:\n${works.works.map(row).join('\n')}`);
      if (page === 1) first = works.works[0];
    }
  }
  const editions = first && (await catalog.editions([first.id, ...first.also], undefined, first.words));
  if (editions && !('unavailable' in editions)) {
    console.log(editions.editions.map(({ isbn, year, title, publisher, collection, language }) => `${isbn} ${year} ${language} | ${title} | ${publisher} | ${collection}`).join('\n'));
    console.log('No ISBN:', editions.noIsbn);
  }
  catalog.close();
  process.exit(0);
}

// `--series <Series identifier> <Volume number>`: the Volumes of a Series of
// Search (Catalog `seriesVolumes`) and the Editions of one Volume.
if (process.argv[2] === '--series') {
  const catalog = createCatalog({ file: ':memory:', fetch: recording, host: 'record.local', accounts: { findDid: () => undefined } });
  const found = await catalog.seriesVolumes(process.argv[3]);
  if ('unavailable' in found) throw new Error('A source failed');
  console.log(found.volumes.map(({ id, number, title }) => `${number} | ${title} | ${id}`).join('\n'));
  const volume = found.volumes.find(({ number }) => number === Number(process.argv[4]));
  const editions = volume && (await catalog.editions([volume.id]));
  if (editions && !('unavailable' in editions))
    console.log(editions.editions.map((each) => `${each.isbn} ${each.year} | ${each.volume} · ${each.volumeTitle} | ${each.line?.publisher} ${each.line?.first}–${each.line?.last}`).join('\n'));
  catalog.close();
  process.exit(0);
}

const fill = process.argv.includes('--fill');
for (const isbn of process.argv.slice(2).filter((arg) => arg !== '--fill')) {
  const { facts, failed } = await fetchFacts(recording, isbn);
  console.log(isbn, failed ? '(a source failed)' : '', JSON.stringify(facts, null, 2));
  if (!fill) continue;
  const catalog = createCatalog({ file: ':memory:', fetch: recording, host: 'record.local', accounts: { findDid: () => undefined } });
  const found = await catalog.lookup(isbn);
  if ('found' in found) {
    const volumes = await catalog.volumes(found.found, { fill: true });
    console.log(isbn, 'Edition Line:', volumes.map((each) => `${each.volume} ${each.isbn} ${each.work.id}`).join('\n'));
  }
  catalog.close();
}
