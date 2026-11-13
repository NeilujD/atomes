import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createLibraryStore, type LibraryStore } from './library-store';
import { publicRepo } from './public-repo';
import { fakePublicRepo, type FakePublicRepo } from './public-repo.fake';
import { createSharing, type Sharing } from './sharing';
import { handleSharingRequest } from './sharing-api';

const owner = 'did:plc:owner';
const other = 'did:plc:other';
const at = '2026-11-13T10:00:00.000Z';

let library: LibraryStore;
let pds: Map<string, FakePublicRepo>;
let noConsent: Set<string>;
let unreachable: boolean;
let sharing: Sharing;

beforeEach(() => {
  library = createLibraryStore(':memory:');
  pds = new Map([owner, other].map((did) => [did, fakePublicRepo(did)]));
  noConsent = new Set();
  unreachable = false;
  sharing = createSharing({
    file: ':memory:',
    library,
    access: {
      repoOf: (did) => {
        if (unreachable) return Promise.reject(new TypeError('fetch failed'));
        return Promise.resolve(noConsent.has(did) ? undefined : publicRepo(pds.get(did)!.handler, did));
      },
    },
  });
  for (const did of [owner, other]) {
    library.put(did, 'app.atomes.readingStatus', 'wd:Q1', { $type: 'app.atomes.readingStatus', work: 'wd:Q1', isbn: '9782723478991', status: 'read', updatedAt: at });
  }
});

afterEach(() => {
  sharing.close();
  library.close();
});

function call(did: string, method: string, path: string, body?: unknown) {
  const init: RequestInit = body === undefined ? { method } : { method, body: JSON.stringify(body) };
  return handleSharingRequest(new Request(`https://atomes.test/api/sharing${path}`, init), { did, sharing });
}

describe('the sharing API', () => {
  test('gives the reader what they share, all Private at first', async () => {
    const response = await call(owner, 'GET', '');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      shared: { readingStatuses: false, follows: false, labels: false },
      privateWorks: [],
      pending: false,
      canShare: true,
    });
  });

  test('shares and unshares a category', async () => {
    const shared = await call(owner, 'PUT', '/categories/readingStatuses', { shared: true });
    expect(await shared.json()).toMatchObject({ shared: { readingStatuses: true } });
    expect([...pds.get(owner)!.records.keys()]).toEqual(['app.atomes.readingStatus/wd:Q1']);

    await call(owner, 'PUT', '/categories/readingStatuses', { shared: false });
    expect([...pds.get(owner)!.records.keys()]).toEqual([]);
  });

  test('keeps a Work Private and lets it go', async () => {
    const kept = await call(owner, 'PUT', `/private-works/${encodeURIComponent('isbn:9782723478991')}`, { private: true });
    expect(await kept.json()).toMatchObject({ privateWorks: ['isbn:9782723478991'] });

    const freed = await call(owner, 'PUT', `/private-works/${encodeURIComponent('isbn:9782723478991')}`, { private: false });
    expect(await freed.json()).toMatchObject({ privateWorks: [] });
  });

  test('acts only for the DID of the session, whatever the request names', async () => {
    await call(owner, 'PUT', '/categories/readingStatuses', { shared: true, did: other, repo: other });

    expect([...pds.get(other)!.records.keys()]).toEqual([]);
    expect(await (await call(other, 'GET', '?did=did:plc:owner')).json()).toMatchObject({ shared: { readingStatuses: false } });
  });

  test('answers 403 NeedsConsent when the session may not write Shared records', async () => {
    noConsent.add(owner);

    const response = await call(owner, 'PUT', '/categories/readingStatuses', { shared: true });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: 'NeedsConsent' });
    expect(await (await call(owner, 'GET', '')).json()).toMatchObject({ shared: { readingStatuses: false }, canShare: false });
  });

  test('answers 503 when the PDS cannot be reached to share', async () => {
    unreachable = true;

    const response = await call(owner, 'PUT', '/categories/labels', { shared: true });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'PdsUnreachable' });
  });

  test('tries the PDS again on POST /sync', async () => {
    await call(owner, 'PUT', '/categories/readingStatuses', { shared: true });
    pds.get(owner)!.records.clear();

    const response = await call(owner, 'POST', '/sync');

    expect(response.status).toBe(200);
    expect([...pds.get(owner)!.records.keys()]).toEqual(['app.atomes.readingStatus/wd:Q1']);
  });

  test.each([
    ['an unknown category', 'PUT', '/categories/copies', { shared: true }, 400],
    ['a body with no boolean', 'PUT', '/categories/labels', { shared: 'yes' }, 400],
    ['a Work that is not a Catalog identifier', 'PUT', '/private-works/not%20a%20work', { private: true }, 400],
    ['an unknown path', 'GET', '/everything', undefined, 404],
    ['a delete', 'DELETE', '/categories/labels', undefined, 405],
  ])('refuses %s', async (_, method, path, body, status) => {
    expect((await call(owner, method, path, body)).status).toBe(status);
    expect(pds.get(owner)!.calls.filter((each) => each.startsWith('POST'))).toEqual([]);
  });
});
