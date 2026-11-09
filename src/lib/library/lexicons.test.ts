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

// The Space lexicon (lexicons-space/) stays out: the stable parser refuses
// `type: "space"` (spike 0003). The server accepts these types only.
test('the loaded lexicons are exactly the Library record types', async () => {
  const docs = (await lexiconFiles()).map(({ doc }) => doc);

  expect(docs.every((doc) => doc.defs.main?.type === 'record')).toBe(true);
  expect(docs.map((doc) => doc.id).sort()).toEqual(
    [copyCollection, followCollection, labelCollection, readingStatusCollection, toBuyCollection].sort(),
  );
});

test('the Space lexicon, kept for the move to Spaces, lists the same record types', async () => {
  const space = JSON.parse(await readFile(new URL('../../../lexicons-space/app/atomes/library.json', import.meta.url), 'utf8')) as {
    defs: { main: { collections: string[] } };
  };

  expect([...space.defs.main.collections].sort()).toEqual(
    [copyCollection, followCollection, labelCollection, readingStatusCollection, toBuyCollection].sort(),
  );
});
