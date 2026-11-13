import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createLibraryStore, type LibraryStore } from './library-store';
import { fakePublicRepo, type FakePublicRepo } from './public-repo.fake';
import { publicRepo } from './public-repo';
import { createSharing, NeedsConsentError, type Sharing } from './sharing';

const owner = 'did:plc:owner';
const other = 'did:plc:other';
const at = '2026-11-13T10:00:00.000Z';
const onePiece = 'wd:Q1';
const secret = 'wd:Q-secret';

const status = (work: string, state = 'read') => ({ $type: 'app.atomes.readingStatus', work, isbn: '9782723478991', status: state, updatedAt: at });
const label = (name: string, works: string[]) => ({ $type: 'app.atomes.label', name, works, createdAt: at });
const follow = (series: string) => ({ $type: 'app.atomes.follow', series, anchorIsbn: '9782723478991', status: 'following', updatedAt: at });
const copy = { $type: 'app.atomes.copy', isbn: '9782723478991', works: [onePiece], createdAt: at };
const loan = { $type: 'app.atomes.loan', copy: '3l2copy', borrower: 'Alice', lentAt: at, createdAt: at };
const toBuy = { $type: 'app.atomes.toBuy', isbn: '9782723488525', createdAt: at };

let library: LibraryStore;
let pds: Map<string, FakePublicRepo>;
// DIDs whose session may not write Shared records.
let noConsent: Set<string>;
let sharing: Sharing;

beforeEach(() => {
  library = createLibraryStore(':memory:');
  pds = new Map([owner, other].map((did) => [did, fakePublicRepo(did)]));
  noConsent = new Set();
  sharing = createSharing({
    file: ':memory:',
    library,
    access: {
      repoOf: (did) => Promise.resolve(noConsent.has(did) ? undefined : publicRepo(pds.get(did)!.handler, did)),
    },
  });
});

afterEach(() => {
  sharing.close();
  library.close();
});

// The whole Library of the owner: every record type.
function fillLibrary(did = owner) {
  library.put(did, 'app.atomes.readingStatus', onePiece, status(onePiece));
  library.put(did, 'app.atomes.readingStatus', secret, status(secret));
  library.put(did, 'app.atomes.label', '3l2label', label('Manga', [onePiece, secret]));
  library.put(did, 'app.atomes.follow', 'wd:Q673', follow('wd:Q673'));
  library.put(did, 'app.atomes.copy', '3l2copy', copy);
  library.put(did, 'app.atomes.loan', '3l2loan', loan);
  library.put(did, 'app.atomes.toBuy', '9782723488525', toBuy);
}

const publicKeys = (did = owner) => [...pds.get(did)!.records.keys()].sort();

describe('sharing a category', () => {
  test('writes its records to the public repo, and never a Copy, Loan or To Buy record', async () => {
    fillLibrary();

    await sharing.setShared(owner, 'readingStatuses', true);
    await sharing.setShared(owner, 'labels', true);
    await sharing.setShared(owner, 'follows', true);

    expect(publicKeys()).toEqual([
      'app.atomes.follow/wd:Q673',
      'app.atomes.label/3l2label',
      `app.atomes.readingStatus/${secret}`,
      `app.atomes.readingStatus/${onePiece}`,
    ]);
    expect(pds.get(owner)!.records.get(`app.atomes.readingStatus/${onePiece}`)).toEqual(status(onePiece));
    const everything = JSON.stringify([...pds.get(owner)!.records.values()]);
    expect(everything).not.toMatch(/app\.atomes\.(copy|loan|toBuy)|Alice|9782723488525/);
  });
});

describe('a Work kept Private inside a Shared category', () => {
  test('keeps its Reading Status off the PDS and leaves it out of the shared Labels', async () => {
    fillLibrary();
    await sharing.setPrivate(owner, secret, true);

    await sharing.setShared(owner, 'readingStatuses', true);
    await sharing.setShared(owner, 'labels', true);

    expect(publicKeys()).toEqual(['app.atomes.label/3l2label', `app.atomes.readingStatus/${onePiece}`]);
    expect(pds.get(owner)!.records.get('app.atomes.label/3l2label')).toEqual(label('Manga', [onePiece]));
    expect(JSON.stringify([...pds.get(owner)!.records.values()])).not.toContain(secret);
    // The instance keeps the whole record: the devices still see it.
    expect(library.get(owner, 'app.atomes.label', '3l2label')).toEqual(label('Manga', [onePiece, secret]));
  });

  test('made Private after sharing, leaves the PDS; made Shared again, comes back', async () => {
    fillLibrary();
    await sharing.setShared(owner, 'readingStatuses', true);

    expect((await sharing.setPrivate(owner, secret, true)).privateWorks).toEqual([secret]);
    expect(publicKeys()).toEqual([`app.atomes.readingStatus/${onePiece}`]);

    await sharing.setPrivate(owner, secret, false);
    expect(publicKeys()).toEqual([`app.atomes.readingStatus/${secret}`, `app.atomes.readingStatus/${onePiece}`]);
  });

  test('stays off the PDS when its Reading Status changes later', async () => {
    fillLibrary();
    await sharing.setPrivate(owner, secret, true);
    await sharing.setShared(owner, 'readingStatuses', true);

    library.put(owner, 'app.atomes.readingStatus', secret, status(secret, 'reading'));
    await sharing.recordChanged(owner, 'app.atomes.readingStatus', secret);

    expect(publicKeys()).toEqual([`app.atomes.readingStatus/${onePiece}`]);
  });
});

describe('unsharing a category', () => {
  test('deletes its records from the PDS and leaves the other Shared categories', async () => {
    fillLibrary();
    await sharing.setShared(owner, 'readingStatuses', true);
    await sharing.setShared(owner, 'follows', true);

    const after = await sharing.setShared(owner, 'readingStatuses', false);

    expect(publicKeys()).toEqual(['app.atomes.follow/wd:Q673']);
    expect(after).toMatchObject({ shared: { readingStatuses: false, follows: true, labels: false }, pending: false });
    // The records stay on the instance, Private.
    expect(library.list(owner, 'app.atomes.readingStatus')).toHaveLength(2);
  });

  test('when the PDS cannot be reached, is saved and pending, and the next sync deletes', async () => {
    fillLibrary();
    await sharing.setShared(owner, 'readingStatuses', true);
    pds.get(owner)!.network.online = false;

    expect(await sharing.setShared(owner, 'readingStatuses', false)).toMatchObject({ shared: { readingStatuses: false }, pending: true });

    pds.get(owner)!.network.online = true;
    expect(await sharing.sync(owner)).toMatchObject({ pending: false });
    expect(publicKeys()).toEqual([]);
  });
});

describe('a record that changes after sharing', () => {
  test('reaches the PDS when its category is Shared, and a delete removes it', async () => {
    await sharing.setShared(owner, 'readingStatuses', true);

    library.put(owner, 'app.atomes.readingStatus', onePiece, status(onePiece, 'reading'));
    await sharing.recordChanged(owner, 'app.atomes.readingStatus', onePiece);
    expect(pds.get(owner)!.records.get(`app.atomes.readingStatus/${onePiece}`)).toEqual(status(onePiece, 'reading'));

    library.delete(owner, 'app.atomes.readingStatus', onePiece);
    await sharing.recordChanged(owner, 'app.atomes.readingStatus', onePiece);
    expect(publicKeys()).toEqual([]);
  });

  test('stays on the instance when its category is not Shared, and calls no PDS', async () => {
    await sharing.setShared(owner, 'labels', true);
    const calls = pds.get(owner)!.calls.length;

    for (const [collection, rkey, value] of [
      ['app.atomes.readingStatus', onePiece, status(onePiece)],
      ['app.atomes.copy', '3l2copy', copy],
      ['app.atomes.loan', '3l2loan', loan],
      ['app.atomes.toBuy', '9782723488525', toBuy],
    ] as const) {
      library.put(owner, collection, rkey, value);
      await sharing.recordChanged(owner, collection, rkey);
    }

    expect(publicKeys()).toEqual([]);
    expect(pds.get(owner)!.calls.length).toBe(calls);
  });
});

describe('a failure halfway', () => {
  test('leaves the sharing pending; the next change finishes it, and a second sync writes nothing', async () => {
    fillLibrary();
    pds.get(owner)!.network.failAfter = 1;

    expect(await sharing.setShared(owner, 'readingStatuses', true)).toMatchObject({ shared: { readingStatuses: true }, pending: true });
    expect(publicKeys()).toHaveLength(1);

    pds.get(owner)!.network.failAfter = undefined;
    library.put(owner, 'app.atomes.follow', 'wd:Q673', follow('wd:Q673'));
    await sharing.recordChanged(owner, 'app.atomes.follow', 'wd:Q673');
    expect(publicKeys()).toEqual([`app.atomes.readingStatus/${secret}`, `app.atomes.readingStatus/${onePiece}`]);
    expect((await sharing.state(owner)).pending).toBe(false);

    const writes = pds.get(owner)!.calls.filter((call) => call.startsWith('POST')).length;
    await sharing.sync(owner);
    expect(pds.get(owner)!.calls.filter((call) => call.startsWith('POST')).length).toBe(writes);
  });
});

describe('the permission to write Shared records', () => {
  test('missing, sharing is refused and nothing is saved or written', async () => {
    fillLibrary();
    noConsent.add(owner);

    await expect(sharing.setShared(owner, 'readingStatuses', true)).rejects.toThrow(NeedsConsentError);
    expect(await sharing.state(owner)).toMatchObject({ shared: { readingStatuses: false }, canShare: false, pending: false });
    expect(publicKeys()).toEqual([]);
  });

  test('missing, unsharing is still saved, pending until the reader signs in again', async () => {
    fillLibrary();
    await sharing.setShared(owner, 'readingStatuses', true);
    noConsent.add(owner);

    expect(await sharing.setShared(owner, 'readingStatuses', false)).toMatchObject({ shared: { readingStatuses: false }, pending: true });

    noConsent.delete(owner);
    await sharing.sync(owner);
    expect(publicKeys()).toEqual([]);
  });
});

describe('each reader', () => {
  test('shares only their own records, to their own repo', async () => {
    fillLibrary(owner);
    library.put(other, 'app.atomes.readingStatus', 'wd:Q-other', status('wd:Q-other'));

    await sharing.setShared(owner, 'readingStatuses', true);
    await sharing.setPrivate(owner, 'wd:Q-other', true);

    expect(publicKeys(owner)).toEqual([`app.atomes.readingStatus/${secret}`, `app.atomes.readingStatus/${onePiece}`]);
    expect(publicKeys(other)).toEqual([]);
    expect(await sharing.state(other)).toMatchObject({ shared: { readingStatuses: false }, privateWorks: [] });
  });
});

describe('what a Shared record may reveal', () => {
  test('a Reading Status whose record key is a Private Work stays off the PDS, whatever its work field says', async () => {
    library.put(owner, 'app.atomes.readingStatus', secret, status(onePiece));
    await sharing.setPrivate(owner, secret, true);

    await sharing.setShared(owner, 'readingStatuses', true);
    library.put(owner, 'app.atomes.readingStatus', secret, status(onePiece, 'reading'));
    await sharing.recordChanged(owner, 'app.atomes.readingStatus', secret);

    expect(publicKeys()).toEqual([]);
  });

  test('a Label whose Works are all Private is not Shared, and leaves the PDS', async () => {
    library.put(owner, 'app.atomes.label', '3l2secret', label('Secret Santa', [secret]));
    library.put(owner, 'app.atomes.label', '3l2empty', label('To sort', []));
    await sharing.setShared(owner, 'labels', true);
    expect(publicKeys()).toEqual(['app.atomes.label/3l2empty', 'app.atomes.label/3l2secret']);

    await sharing.setPrivate(owner, secret, true);
    expect(publicKeys()).toEqual(['app.atomes.label/3l2empty']);

    library.put(owner, 'app.atomes.label', '3l2secret', label('Secret Santa 2', [secret]));
    await sharing.recordChanged(owner, 'app.atomes.label', '3l2secret');
    expect(publicKeys()).toEqual(['app.atomes.label/3l2empty']);
    expect(JSON.stringify([...pds.get(owner)!.records.values()])).not.toContain('Secret Santa');
  });
});

describe('a change the PDS did not get', () => {
  test('keeping a Work Private says it is still on the PDS, and the next look at the state removes it', async () => {
    fillLibrary();
    await sharing.setShared(owner, 'readingStatuses', true);
    pds.get(owner)!.network.online = false;

    expect(await sharing.setPrivate(owner, secret, true)).toMatchObject({ privateWorks: [secret], pending: true });
    expect(publicKeys()).toContain(`app.atomes.readingStatus/${secret}`);

    pds.get(owner)!.network.online = true;
    expect(await sharing.state(owner)).toMatchObject({ pending: false });
    expect(publicKeys()).toEqual([`app.atomes.readingStatus/${onePiece}`]);
  });

  test('the state of a reader with nothing pending calls no PDS write', async () => {
    fillLibrary();
    await sharing.setShared(owner, 'readingStatuses', true);
    const writes = () => pds.get(owner)!.calls.filter((call) => call.startsWith('POST') || call.endsWith('listRecords')).length;
    const before = writes();

    await sharing.state(owner);

    expect(writes()).toBe(before);
  });
});

test('a record change never rejects, even when the sharing tables fail', async () => {
  const broken = createSharing({ file: ':memory:', library, access: { repoOf: () => Promise.resolve(undefined) } });
  broken.close();

  await expect(broken.recordChanged(owner, 'app.atomes.readingStatus', onePiece)).resolves.toBeUndefined();
});

describe('signing in again', () => {
  test('sends what waited for the permission, and calls no PDS when nothing waits', async () => {
    fillLibrary();
    await sharing.setShared(owner, 'readingStatuses', true);
    noConsent.add(owner);
    await sharing.setShared(owner, 'readingStatuses', false);
    expect(publicKeys()).toHaveLength(2);

    noConsent.delete(owner);
    await sharing.signedIn(owner);
    expect(publicKeys()).toEqual([]);

    const calls = pds.get(owner)!.calls.length;
    await sharing.signedIn(owner);
    expect(pds.get(owner)!.calls.length).toBe(calls);
  });
});
