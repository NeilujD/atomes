import { expect, test } from 'vitest';
import { lexiconRules } from '../server/library-api';
import { fakeInstance } from '../space/instance.fake';
import { openInstanceStore } from '../space/instance-store';
import { memoryLocalCopy } from '../space/local-copy.fake';
import { savedText, waitingCount } from './library';
import { readingStatusCollection, saveReadingStatus } from './reading-status';

const owner = 'did:plc:owner';
const updatedAt = '2026-11-09T10:00:00.000Z';

// The device and the instance run the same lexicon check (ADR 0012).
function device() {
  const server = fakeInstance(owner, lexiconRules);
  return { server, space: openInstanceStore(server.handler, owner, memoryLocalCopy()) };
}

test('a save the app checks is accepted by the instance', async () => {
  const { server, space } = device();

  expect(await saveReadingStatus(space, { work: 'wd:Q673', isbn: '9782723478991', status: 'read', updatedAt })).toBe('sent');
  expect(server.writes).toEqual(['put wd:Q673']);
});

test('a write the instance answers with 400 stays refused in the pending list, with its reason, and does not wait', async () => {
  const { server, space } = device();
  // An older app build, or a bug, sends a record without its status.
  const state = await space.put(readingStatusCollection, 'wd:Q673', { work: 'wd:Q673', isbn: '9782723478991', updatedAt });

  expect(state).toBe('refused');
  const [pending] = await space.pending();
  expect(pending?.rkey).toBe('wd:Q673');
  expect(pending?.refused).toContain('Record must have the property "status"');
  expect(await waitingCount(space)).toBe(0);

  await space.sendWaiting();
  expect(server.writes).toEqual([]);
  expect(await space.pending()).toHaveLength(1);

  expect(await savedText(space, state)).toBe(
    'The Atomes server refused this change, so it is not saved. ' +
      'Reason: The record does not match the app.atomes.readingStatus lexicon: Record must have the property "status"',
  );
});
