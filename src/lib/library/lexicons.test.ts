import { readdir, readFile } from 'node:fs/promises';
import { parseLexiconDoc } from '@atproto/lexicon';
import { expect, test } from 'vitest';
import { copyCollection } from './copy';
import { followCollection } from './follow';
import { labelCollection } from './label';
import { loanCollection } from './loan';
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

  const libraryTypes = [copyCollection, followCollection, labelCollection, loanCollection, readingStatusCollection, toBuyCollection].sort();
  expect(space?.type === 'space' && [...space.collections].sort()).toEqual(libraryTypes);
  expect(recordTypes.sort()).toEqual(libraryTypes);
});

// ADR 0010, amendment 2026-11-09: Loans replace Lent To, so who has a Copy has one source.
test('a Copy no longer says who has it: Loans do', async () => {
  const copy = (await lexiconFiles()).find(({ doc }) => doc.id === copyCollection)?.doc.defs.main;

  expect(copy?.type === 'record' && Object.keys(copy.record.properties ?? {})).not.toContain('lentTo');
});
