// Asks the real book sources about some ISBNs, the way the Catalog does, and
// saves every answer in src/lib/catalog/fixtures/ for the tests. Prints what
// each source says, to check the Catalog on real ISBNs (CORE-27 staging check).
//
// Usage: bun scripts/record-catalog-answers.ts 9782723478991 9791042021030
// Review the diff before committing: answers change when the sources fix data.
import { writeFile } from 'node:fs/promises';
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

for (const isbn of process.argv.slice(2)) {
  const { facts, failed } = await fetchFacts(recording, isbn);
  console.log(isbn, failed ? '(a source failed)' : '', JSON.stringify(facts, null, 2));
}
