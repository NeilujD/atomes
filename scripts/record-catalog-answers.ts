// Asks the real book sources about some ISBNs, the way the Catalog does, and
// saves every answer in src/lib/catalog/fixtures/ for the tests. Prints what
// each source says, to check the Catalog on real ISBNs (CORE-27 staging check).
//
// Usage: bun scripts/record-catalog-answers.ts 9782723478991 9791042021030
//        bun scripts/record-catalog-answers.ts --fill 9791042021030
// `--fill` also records the BnF search and Inventaire answers that list the
// whole Edition Line of each ISBN (Catalog `volumes`).
// Review the diff before committing: answers change when the sources fix data.
import { writeFile } from 'node:fs/promises';
import { createCatalog } from '../src/lib/catalog/catalog';
import { fixtureDir, fixtureName } from '../src/lib/catalog/recorded.fake';
import type { SourceFetch } from '../src/lib/catalog/sources';
import { fetchFacts, politeFetch } from '../src/lib/catalog/sources';

const real = politeFetch('Atomes/record (+https://github.com/NeilujD/atomes)');
const recording: SourceFetch = async (url) => {
  const response = await real(url);
  const body = await response.text();
  console.log(response.status, url);
  if (response.ok) await writeFile(new URL(fixtureName(url), fixtureDir), body);
  return new Response(body, { status: response.status });
};

const fill = process.argv.includes('--fill');
for (const isbn of process.argv.slice(2).filter((arg) => arg !== '--fill')) {
  const { facts, failed } = await fetchFacts(recording, isbn);
  console.log(isbn, failed ? '(a source failed)' : '', JSON.stringify(facts, null, 2));
  if (!fill) continue;
  const catalog = createCatalog({ file: ':memory:', fetch: recording, host: 'record.local' });
  const found = await catalog.lookup(isbn);
  if ('found' in found) {
    const volumes = await catalog.volumes(found.found, { fill: true });
    console.log(isbn, 'Edition Line:', volumes.map((each) => `${each.volume} ${each.isbn} ${each.work.id}`).join('\n'));
  }
  catalog.close();
}
