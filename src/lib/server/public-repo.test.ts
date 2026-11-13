import { expect, test } from 'vitest';
import { publicRepo } from './public-repo';
import { fakePublicRepo } from './public-repo.fake';

const did = 'did:plc:owner';
const collection = 'app.atomes.readingStatus';
const status = (work: string) => ({ $type: collection, work, isbn: '9782723478991', status: 'read', updatedAt: '2026-11-13T10:00:00.000Z' });

test('puts, lists and deletes records in the public repo of the DID', async () => {
  const pds = fakePublicRepo(did);
  const repo = publicRepo(pds.handler, did);

  await repo.put(collection, 'wd:Q1', status('wd:Q1'));
  await repo.put(collection, 'wd:Q2', status('wd:Q2'));
  expect(await repo.list(collection)).toEqual([
    { rkey: 'wd:Q2', value: status('wd:Q2') },
    { rkey: 'wd:Q1', value: status('wd:Q1') },
  ]);

  await repo.delete(collection, 'wd:Q1');
  await repo.delete(collection, 'wd:Q1');
  expect([...pds.records.keys()]).toEqual([`${collection}/wd:Q2`]);
});

test('lists every page', async () => {
  const pds = fakePublicRepo(did);
  const repo = publicRepo(pds.handler, did);
  for (let i = 0; i < 230; i++) pds.records.set(`${collection}/isbn:${String(i).padStart(3, '0')}`, {});

  expect(await repo.list(collection)).toHaveLength(230);
  expect(pds.calls.filter((call) => call.endsWith('listRecords'))).toHaveLength(3);
});

test.each(['app.atomes.copy', 'app.atomes.loan', 'app.atomes.toBuy', 'app.bsky.feed.post'])(
  'never writes %s, which is never Shared, and calls no PDS',
  async (other) => {
    const pds = fakePublicRepo(did);
    const repo = publicRepo(pds.handler, did);

    await expect(repo.put(other, 'x', { $type: other })).rejects.toThrow();
    await expect(repo.delete(other, 'x')).rejects.toThrow();
    await expect(repo.list(other)).rejects.toThrow();
    expect(pds.calls).toEqual([]);
  },
);

test('a PDS error is thrown with its XRPC error name', async () => {
  const pds = fakePublicRepo(did);
  pds.network.failAfter = 0;

  await expect(publicRepo(pds.handler, did).put(collection, 'wd:Q1', status('wd:Q1'))).rejects.toThrow('InternalServerError');
});
