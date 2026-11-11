// Links two identifiers of one Series by hand, when no source does (ADR 0010,
// same_as): SUDOC calls the Series of Asterix and the White Iris "Aterix", so
// it gets its own minted identifier. One Series keeps the best identifier and
// its title; the other identifier still resolves to it. Reader records are
// not changed.
//
// Usage: bun scripts/link-series.ts atomes:<host>:<ULID> wd:Q42490
// It opens catalog.sqlite in DATA_DIR (`data/` by default) and asks no source.
import { join } from 'node:path';
import { createCatalog } from '../src/lib/catalog/catalog';
import { isSeriesId } from '../src/lib/library/ids';

const [a, b] = process.argv.slice(2);
if (!a || !b || !isSeriesId(a) || !isSeriesId(b)) {
  console.error('Usage: bun scripts/link-series.ts <Series identifier> <Series identifier>');
  process.exit(1);
}
const catalog = createCatalog({
  file: join(process.env.DATA_DIR ?? 'data', 'catalog.sqlite'),
  fetch: () => Promise.reject(new Error('link-series asks no source')),
  // Linking mints no identifier.
  host: 'link-series.invalid',
});
const linked = catalog.link(a, b);
const unknown = [a, b].filter((id) => !catalog.series(id));
catalog.close();
if (!linked) {
  console.error(`This Catalog does not know ${unknown.join(' or ')}.`);
  process.exit(1);
}
console.log(`Linked: ${linked.id} "${linked.title}", same as ${linked.sameAs.join(', ')}`);
