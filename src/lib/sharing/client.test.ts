import { expect, test } from 'vitest';
import { sharingClient } from './client';
import type { SharingState } from './categories';

const state: SharingState = {
  shared: { readingStatuses: true, follows: false, labels: false },
  privateWorks: [],
  pending: false,
  canShare: true,
};

function answering(status: number, body: unknown) {
  const asked: [string, RequestInit | undefined][] = [];
  const client = sharingClient((input, init) => {
    asked.push([input, init]);
    return Promise.resolve(Response.json(body, { status }));
  });
  return { client, asked };
}

test('shares a category with a PUT on its path', async () => {
  const { client, asked } = answering(200, state);

  expect(await client.setShared('readingStatuses', true)).toEqual({ state });
  expect(asked[0][0]).toBe('/api/sharing/categories/readingStatuses');
  expect(asked[0][1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ shared: true }) });
});

test('keeps a Work Private with its identifier in the path', async () => {
  const { client, asked } = answering(200, state);

  await client.setPrivate('isbn:9782723478991', true);
  expect(asked[0][0]).toBe('/api/sharing/private-works/isbn%3A9782723478991');
});

test.each([
  [403, { error: 'NeedsConsent' }, { needsConsent: true }],
  [401, { error: 'SignedOut' }, { signedOut: true }],
  [503, { error: 'PdsUnreachable' }, { unreachable: true }],
  [500, {}, { failed: true }],
])('an answer %i is %j', async (status, body, answer) => {
  expect(await answering(status, body).client.load()).toEqual(answer);
});

test('no network is unreachable', async () => {
  const client = sharingClient(() => Promise.reject(new TypeError('Failed to fetch')));

  expect(await client.sync()).toEqual({ unreachable: true });
});
