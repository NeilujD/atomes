import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { createCatalog } from '../catalog/catalog';
import { recordedFetch } from '../catalog/recorded.fake';
import { copyCollection } from '../library/copy';
import { labelCollection } from '../library/label';
import { readingStatusCollection } from '../library/reading-status';
import { createLibraryStore } from './library-store';
import { openDatabase } from './migrate';
import { librarySteps } from './migrations';
import { publicRepo } from './public-repo';
import { fakePublicRepo } from './public-repo.fake';
import { collections, planRepair, repairSharedWorks, type ReaderRecords } from './repair-shared-works';
import { createSharing } from './sharing';

const owner = 'did:plc:owner';
const dropped = 'inv:91e782c2fc0f67739836a22c452f3623';
const volume2 = '9782876952065';
const volume3 = '9782876952072';
const kept = 'inv:31cee958a93ba50697a3fec2a32fc0c0'; // Volume 1's own Work
const volume1 = '9782876952058';

const status = (work: string, isbn: string, updatedAt = '2026-11-10T10:00:00.000Z') => ({
  $type: readingStatusCollection,
  work,
  isbn,
  status: 'read',
  updatedAt,
});
const copy = (isbn: string, works: string[]) => ({ $type: copyCollection, isbn, works, createdAt: '2026-11-10T10:00:00.000Z' });
const label = (name: string, works: string[]) => ({ $type: labelCollection, name, works, createdAt: '2026-11-10T10:00:00.000Z' });

const reader = (change: Partial<ReaderRecords> = {}): ReaderRecords => ({
  did: owner,
  readingStatuses: [],
  copies: [],
  labels: [],
  privateWorks: [],
  ...change,
});
// The Catalog after the drop: Volumes 2 and 3 have their own Work, Volume 1 keeps its own.
const workOf = (isbn: string) => (isbn === volume1 ? kept : isbn === volume2 || isbn === volume3 ? `isbn:${isbn}` : undefined);
const droppedWorks = new Set([dropped]);

test('names the collections of the Library', () => {
  expect(collections).toEqual({ readingStatus: readingStatusCollection, copy: copyCollection, label: labelCollection });
});

describe('the repair of one reader', () => {
  test('moves a Reading Status on a dropped Work to the Work of the Edition read', () => {
    const repair = planRepair(reader({ readingStatuses: [{ rkey: dropped, value: status(dropped, volume2) }] }), droppedWorks, workOf);

    expect(repair.puts).toEqual([{ collection: readingStatusCollection, rkey: `isbn:${volume2}`, value: status(`isbn:${volume2}`, volume2) }]);
    expect(repair.deletes).toEqual([{ collection: readingStatusCollection, rkey: dropped }]);
    expect(repair.counts.readingStatuses).toBe(1);
  });

  test('a newer Reading Status already on the Work of the Edition stays; the old one goes', () => {
    const newer = status(`isbn:${volume2}`, volume2, '2026-11-14T10:00:00.000Z');
    const repair = planRepair(
      reader({ readingStatuses: [{ rkey: `isbn:${volume2}`, value: newer }, { rkey: dropped, value: status(dropped, volume2) }] }),
      droppedWorks,
      workOf,
    );

    expect(repair.puts).toEqual([]);
    expect(repair.deletes).toEqual([{ collection: readingStatusCollection, rkey: dropped }]);
  });

  test("a Copy's dropped Work becomes the Work of the Copy's Edition; its other Works stay", () => {
    const repair = planRepair(
      reader({ copies: [{ rkey: '3l2copy', value: copy(volume3, [dropped]) }, { rkey: '3l2other', value: copy(volume1, [kept]) }] }),
      droppedWorks,
      workOf,
    );

    expect(repair.puts).toEqual([{ collection: copyCollection, rkey: '3l2copy', value: copy(volume3, [`isbn:${volume3}`]) }]);
    expect(repair.deletes).toEqual([]);
    expect(repair.counts.copies).toBe(1);
  });

  test('a Label naming a dropped Work is listed, not changed', () => {
    const repair = planRepair(reader({ labels: [{ rkey: '3l2label', value: label('Manga', [kept, dropped]) }] }), droppedWorks, workOf);

    expect(repair.labels).toEqual([{ rkey: '3l2label', name: 'Manga', works: [dropped] }]);
    expect(repair.puts).toEqual([]);
    expect(repair.counts.labels).toBe(1);
  });

  test('a dropped Work kept Private is listed, and its moved Reading Status stays Private', () => {
    const repair = planRepair(
      reader({ readingStatuses: [{ rkey: dropped, value: status(dropped, volume2) }], privateWorks: [dropped] }),
      droppedWorks,
      workOf,
    );

    expect(repair.privateWorks).toEqual({ listed: [dropped], added: [`isbn:${volume2}`] });
    expect(repair.counts.privateWorks).toBe(1);
  });

  test('a record whose Edition the Catalog now gives another real Work moves to that Work', () => {
    // The record says Volume 1 under the dropped Work; the Catalog gives Volume 1 its own Work.
    const repair = planRepair(
      reader({ readingStatuses: [{ rkey: dropped, value: status(dropped, volume1) }], copies: [{ rkey: '3l2copy', value: copy(volume1, [dropped]) }] }),
      droppedWorks,
      workOf,
    );

    expect(repair.puts).toEqual([
      { collection: readingStatusCollection, rkey: kept, value: status(kept, volume1) },
      { collection: copyCollection, rkey: '3l2copy', value: copy(volume1, [kept]) },
    ]);
    expect(repair.deletes).toEqual([{ collection: readingStatusCollection, rkey: dropped }]);
  });

  test('records on a Work the Catalog still gives their Edition are left alone', () => {
    const repair = planRepair(
      reader({ readingStatuses: [{ rkey: kept, value: status(kept, volume1) }], copies: [{ rkey: '3l2copy', value: copy(volume1, [kept]) }] }),
      droppedWorks,
      workOf,
    );

    expect([repair.puts, repair.deletes]).toEqual([[], []]);
  });
});

describe('the repair script on an instance', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  async function instance() {
    const dir = mkdtempSync(join(tmpdir(), 'atomes-repair-'));
    dirs.push(dir);
    const catalog = createCatalog({ file: join(dir, 'catalog.sqlite'), fetch: recordedFetch().fetch, host: 'catalog.test' });
    await catalog.lookup(volume2);
    await catalog.lookup(volume3);
    catalog.close();
    const library = createLibraryStore(openDatabase(join(dir, 'library.sqlite'), librarySteps));
    const pds = fakePublicRepo(owner);
    const sharing = createSharing({
      db: openDatabase(join(dir, 'library.sqlite'), librarySteps),
      library,
      access: { repoOf: () => Promise.resolve(publicRepo(pds.handler, owner)) },
    });
    return { dir, library, pds, sharing };
  }

  test('a dry run writes nothing', async () => {
    const { dir, library, sharing } = await instance();
    library.put(owner, readingStatusCollection, dropped, status(dropped, volume2));
    const rev = library.changesSince(owner, 0).rev;

    const report = repairSharedWorks(dir, { dryRun: true });

    expect(report.map(({ did, counts }) => [did, counts.readingStatuses])).toEqual([[owner, 1]]);
    expect(library.changesSince(owner, 0).rev).toBe(rev);
    expect((await sharing.state(owner)).pending).toBe(false);
    sharing.close();
    library.close();
  });

  test('moves the Reading Status, devices learn it, and the next share sync moves it on the PDS', async () => {
    const { dir, library, pds, sharing } = await instance();
    library.put(owner, readingStatusCollection, dropped, status(dropped, volume2));
    library.put(owner, copyCollection, '3l2copy', copy(volume2, [dropped]));
    await sharing.setShared(owner, 'readingStatuses', true);
    expect([...pds.records.keys()]).toEqual([`${readingStatusCollection}/${dropped}`]);
    const rev = library.changesSince(owner, 0).rev;

    repairSharedWorks(dir, { dryRun: false });

    expect(library.list(owner, readingStatusCollection)).toEqual([{ rkey: `isbn:${volume2}`, value: status(`isbn:${volume2}`, volume2) }]);
    expect(library.get(owner, copyCollection, '3l2copy')).toEqual(copy(volume2, [`isbn:${volume2}`]));
    expect(library.changesSince(owner, rev).deleted).toEqual([{ collection: readingStatusCollection, rkey: dropped }]);
    // The PDS follows at the next sync: the next record change, Settings or sign-in.
    expect((await sharing.state(owner)).pending).toBe(false);
    expect([...pds.records.keys()]).toEqual([`${readingStatusCollection}/isbn:${volume2}`]);
    sharing.close();
    library.close();
  });

  test('a Catalog that has not run the rule yet stops the repair', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atomes-repair-'));
    dirs.push(dir);

    expect(() => repairSharedWorks(dir, { dryRun: true })).toThrow(/catalog\.sqlite/);
  });
});
