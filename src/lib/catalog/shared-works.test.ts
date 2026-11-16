import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, test } from 'vitest';
import { migrate } from '../server/migrate';
import { catalogSteps } from './migrations';
import { dropSharedWorks } from './shared-works';

const shared = 'inv:91e782c2fc0f67739836a22c452f3623';
const dbs: DatabaseSync[] = [];

afterEach(() => dbs.splice(0).forEach((db) => db.close()));

// A Catalog file holding one Series and these Editions, each with `shared` as its Work.
function catalogWith(editions: { isbn: string; volumes: number[] }[]) {
  const db = new DatabaseSync(':memory:');
  dbs.push(db);
  migrate(db, catalogSteps({ findDid: () => undefined }));
  db.prepare("insert into series (n, id, title) values (1, 'wd:Q15051307', 'Dragon Ball')").run();
  for (const { isbn, volumes } of editions)
    db.prepare(
      `insert into edition (isbn, title, authors, work_id, work_title, series, volume, volumes, sources, fetched_at)
       values (?, 'Dragon Ball', '[]', ?, 'Dragon Ball, tome 2', 1, ?, ?, '["Inventaire"]', '2026-11-14T12:00:00.000Z')`,
    ).run(isbn, shared, volumes[0] ?? null, JSON.stringify(volumes));
  dropSharedWorks(db, 1);
  const works = db.prepare('select isbn, work_id from edition order by isbn').all() as { isbn: string; work_id: string }[];
  return Object.fromEntries(works.map(({ isbn, work_id }) => [isbn, work_id]));
}

describe('One Work per Volume number (ADR 0010, amendment 2026-11-14)', () => {
  test('two Volume numbers lose the Work they share', () => {
    expect(catalogWith([{ isbn: '9782876952065', volumes: [2] }, { isbn: '9782876952072', volumes: [3] }])).toEqual({
      '9782876952065': 'isbn:9782876952065',
      '9782876952072': 'isbn:9782876952072',
    });
  });

  test('a reprint keeps the Work of its Volume', () => {
    expect(catalogWith([{ isbn: '9782876952188', volumes: [8] }, { isbn: '9782723448406', volumes: [8] }])).toEqual({
      '9782876952188': shared,
      '9782723448406': shared,
    });
  });

  test('an omnibus keeps the Work of a Volume it covers; a book with no Volume number tells nothing', () => {
    const works = catalogWith([
      { isbn: '9782344025437', volumes: [1, 2] },
      { isbn: '9782876952058', volumes: [1] },
      { isbn: '9782072927515', volumes: [] },
    ]);

    expect(new Set(Object.values(works))).toEqual(new Set([shared]));
  });

  test('an omnibus and a Volume it does not cover are different Volumes', () => {
    expect(Object.values(catalogWith([{ isbn: '9782344025437', volumes: [1, 2] }, { isbn: '9782876952072', volumes: [3] }]))).toEqual([
      'isbn:9782344025437',
      'isbn:9782876952072',
    ]);
  });
});
