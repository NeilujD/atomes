// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, expect, test } from 'vitest';
import type { SharingState } from '../lib/sharing/categories';
import type { SharingAnswer, SharingClient } from '../lib/sharing/client';
import { WorkPrivacy } from './WorkPrivacy';

const work = 'wd:Q673';
const nothingShared: SharingState = {
  shared: { readingStatuses: false, follows: false, labels: false },
  privateWorks: [],
  pending: false,
  canShare: true,
};

function fakeServer(start: SharingState) {
  let state = start;
  const kept: [string, boolean][] = [];
  const server = { kept, next: undefined as SharingAnswer | undefined };
  const client: SharingClient = {
    load: () => Promise.resolve({ state }),
    setShared: () => Promise.resolve({ failed: true }),
    setPrivate: (id, keep) => {
      kept.push([id, keep]);
      if (server.next) return Promise.resolve(server.next);
      state = { ...state, privateWorks: keep ? [id] : [] };
      return Promise.resolve({ state });
    },
    sync: () => Promise.resolve({ state }),
  };
  render(<WorkPrivacy work={work} client={client} />);
  return server;
}

const input = (element: HTMLElement) => element as HTMLInputElement;

afterEach(cleanup);

test('shows nothing while the Reading Statuses and Labels are Private', async () => {
  fakeServer({ ...nothingShared, shared: { ...nothingShared.shared, follows: true } });

  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(screen.queryByRole('switch')).toBeNull();
});

test('keeps the Work Private inside the Shared Reading Statuses, then lets it go', async () => {
  const server = fakeServer({ ...nothingShared, shared: { ...nothingShared.shared, readingStatuses: true } });
  const keep = input(await screen.findByRole('switch', { name: 'Keep this Work Private' }));
  expect(keep.checked).toBe(false);

  fireEvent.click(keep);
  await waitFor(() => expect(keep.checked).toBe(true));
  fireEvent.click(keep);
  await waitFor(() => expect(keep.checked).toBe(false));

  expect(server.kept).toEqual([
    [work, true],
    [work, false],
  ]);
});

test('says when the change could not be made, and keeps the switch as it was', async () => {
  const server = fakeServer({ ...nothingShared, shared: { ...nothingShared.shared, labels: true } });
  const keep = input(await screen.findByRole('switch', { name: 'Keep this Work Private' }));

  server.next = { unreachable: true };
  fireEvent.click(keep);

  expect(await screen.findByText('Could not reach the server or your PDS. Nothing changed.')).toBeTruthy();
  expect(keep.checked).toBe(false);
});
