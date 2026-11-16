import { DatabaseSync } from 'node:sqlite';
import { expect, test } from 'vitest';
import { migrate } from '../server/migrate';
import { catalogSteps } from './migrations';
import { shownEditions } from './shown';

// The Volumes of an Edition Line are read on every /volumes call and in each
// fill: with Series Corrections laid over the Editions, the Edition Line
// index must still find them.
test('the Editions of one Edition Line are found by the Edition Line index, Series Corrections included', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db, catalogSteps({ findDid: () => undefined }));

  const plan = db.prepare(`explain query plan select isbn from ${shownEditions} where edition_line = ?`).all('1|glenat|fre|18|') as { detail: string }[];
  db.close();

  expect(plan.map(({ detail }) => detail).join('\n')).toMatch(/USING (COVERING )?INDEX edition_line/);
});
