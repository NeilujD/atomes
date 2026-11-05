import { readdir, readFile } from 'node:fs/promises';
import { parseLexiconDoc } from '@atproto/lexicon';
import { expect, test } from 'vitest';
import { copyCollection } from './copy';
import { followCollection } from './follow';
import { labelCollection } from './label';
import { readingStatusCollection } from './reading-status';
import { toBuyCollection } from './to-buy';

// The files `bun scripts/publish-lexicons.ts` publishes.
async function lexiconFiles() {
  const dir = new URL('../../../lexicons/app/atomes/', import.meta.url);
  const names = (await readdir(dir)).filter((name) => name.endsWith('.json'));
  return Promise.all(
    names.map(async (name) => ({ name, doc: parseLexiconDoc(JSON.parse(await readFile(new URL(name, dir), 'utf8'))) })),
  );
}

test('every lexicon file is a valid lexicon whose id matches its path', async () => {
  for (const { name, doc } of await lexiconFiles()) {
    expect(doc.id).toBe(`app.atomes.${name.replace(/\.json$/, '')}`);
  }
});

test('the Library Space lists exactly the Library record types', async () => {
  const docs = (await lexiconFiles()).map(({ doc }) => doc);
  const space = docs.find((doc) => doc.id === 'app.atomes.library')?.defs.main;
  const recordTypes = docs.filter((doc) => doc.defs.main?.type === 'record').map((doc) => doc.id);

  expect(space?.type === 'space' && [...space.collections].sort()).toEqual(
    [copyCollection, followCollection, labelCollection, readingStatusCollection, toBuyCollection].sort(),
  );
  expect(recordTypes.sort()).toEqual([copyCollection, followCollection, labelCollection, readingStatusCollection, toBuyCollection].sort());
});
