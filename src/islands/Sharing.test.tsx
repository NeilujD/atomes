// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, test } from 'vitest';
import type { Category, SharingState } from '../lib/sharing/categories';
import type { SharingAnswer, SharingClient } from '../lib/sharing/client';
import { Sharing } from './Sharing';

const allPrivate: SharingState = {
  shared: { readingStatuses: false, follows: false, labels: false },
  privateWorks: [],
  pending: false,
  canShare: true,
  atproto: true,
};

// A server that keeps what the reader shares, and answers `next` once when set.
function fakeServer(start: SharingState = allPrivate) {
  let state = start;
  const server = { next: undefined as SharingAnswer | undefined, synced: 0, signIns: 0, changes: 0 };
  const answer = (change: () => void): Promise<SharingAnswer> => {
    const once = server.next;
    server.next = undefined;
    if (once) return Promise.resolve(once);
    change();
    return Promise.resolve({ state });
  };
  const client: SharingClient = {
    load: () => answer(() => undefined),
    setShared: (category: Category, shared: boolean) => {
      server.changes += 1;
      return answer(() => (state = { ...state, shared: { ...state.shared, [category]: shared } }));
    },
    setPrivate: () => answer(() => undefined),
    setPrivateWorks: () => answer(() => undefined),
    sync: () =>
      answer(() => {
        server.synced += 1;
        state = { ...state, pending: false };
      }),
  };
  render(<Sharing client={client} signInAgain={() => (server.signIns += 1)} />);
  return server;
}

const input = (element: HTMLElement) => element as HTMLInputElement;

// Turns a switch on, then answers its confirm dialog.
function turnOn(toggle: HTMLInputElement, name: string, button: 'Share' | 'Cancel') {
  fireEvent.click(toggle);
  fireEvent.click(within(screen.getByRole('dialog', { name: `Share ${name}?` })).getByRole('button', { name: button }));
}

afterEach(cleanup);

describe('Sharing in Settings', () => {
  test('shows the three categories, all Private at first, and what is never Shared', async () => {
    fakeServer();

    for (const name of ['Reading Statuses', 'Followed Series', 'Labels']) {
      expect(input(await screen.findByRole('switch', { name })).checked).toBe(false);
    }
    expect(screen.getByText(/Copies, Loans and To Buy are never Shared/)).toBeTruthy();
  });

  test('shares a category, then unshares it', async () => {
    fakeServer();
    const statuses = input(await screen.findByRole('switch', { name: 'Reading Statuses' }));

    turnOn(statuses, 'Reading Statuses', 'Share');
    await waitFor(() => expect(statuses.checked).toBe(true));
    expect(screen.getByText('Shared: public on your AT Protocol account. Anyone can read them, with no Atomes account.')).toBeTruthy();

    fireEvent.click(statuses);
    await waitFor(() => expect(statuses.checked).toBe(false));
  });

  test('asks before sharing the first category: Cancel keeps it Private and asks the server nothing', async () => {
    const server = fakeServer();
    const statuses = input(await screen.findByRole('switch', { name: 'Reading Statuses' }));

    fireEvent.click(statuses);
    const dialog = screen.getByRole<HTMLDialogElement>('dialog', { name: 'Share Reading Statuses?' });
    expect(dialog.open).toBe(true);
    expect(statuses.checked).toBe(false);
    expect(within(dialog).getByText(/other apps may have kept a copy/)).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(dialog.open).toBe(false);
    expect(statuses.checked).toBe(false);
    expect(server.changes).toBe(0);
  });

  test('once a category is Shared, sharing another one asks nothing', async () => {
    const server = fakeServer({ ...allPrivate, shared: { ...allPrivate.shared, labels: true } });
    const follows = input(await screen.findByRole('switch', { name: 'Followed Series' }));

    fireEvent.click(follows);
    await waitFor(() => expect(follows.checked).toBe(true));
    expect(screen.getByRole<HTMLDialogElement>('dialog', { hidden: true }).open).toBe(false);
    expect(server.changes).toBe(1);
  });

  test('unsharing asks nothing', async () => {
    const server = fakeServer({ ...allPrivate, shared: { ...allPrivate.shared, labels: true } });
    const labels = input(await screen.findByRole('switch', { name: 'Labels' }));

    fireEvent.click(labels);
    await waitFor(() => expect(labels.checked).toBe(false));
    expect(screen.getByRole<HTMLDialogElement>('dialog', { hidden: true }).open).toBe(false);
    expect(server.changes).toBe(1);
  });

  test('without the permission, gives the reason and signs in again; nothing is shared', async () => {
    const server = fakeServer({ ...allPrivate, canShare: false });

    expect(await screen.findByText(/needs permission to write on your AT Protocol account/)).toBeTruthy();
    expect(input(screen.getByRole('switch', { name: 'Labels' })).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }));
    expect(server.signIns).toBe(1);
  });

  test('with no AT Protocol Account linked, every switch is disabled with one line that says why, and no sign-in', async () => {
    fakeServer({ ...allPrivate, canShare: false, atproto: false });

    expect(await screen.findByText('To share, link a Bluesky account in Account, above.')).toBeTruthy();
    for (const name of ['Reading Statuses', 'Followed Series', 'Labels']) expect(input(screen.getByRole('switch', { name })).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Sign in again' })).toBeNull();
  });

  test('when the server answers that the permission is missing, asks for it', async () => {
    const server = fakeServer();
    const labels = input(await screen.findByRole('switch', { name: 'Labels' }));

    server.next = { needsConsent: true };
    turnOn(labels, 'Labels', 'Share');

    expect(await screen.findByRole('button', { name: 'Sign in again' })).toBeTruthy();
    expect(labels.checked).toBe(false);
  });

  test('says when the PDS could not be reached, and keeps the switch as it was', async () => {
    const server = fakeServer();
    const follows = input(await screen.findByRole('switch', { name: 'Followed Series' }));

    server.next = { unreachable: true };
    turnOn(follows, 'Followed Series', 'Share');

    expect(await screen.findByText('Could not reach the server or your PDS. Nothing changed.')).toBeTruthy();
    expect(follows.checked).toBe(false);
  });

  test('says when changes wait for the PDS, and tries again', async () => {
    const server = fakeServer({ ...allPrivate, shared: { ...allPrivate.shared, labels: true }, pending: true });

    expect(await screen.findByText('Some changes have not reached your PDS yet.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(screen.queryByText('Some changes have not reached your PDS yet.')).toBeNull());
    expect(server.synced).toBe(1);
  });

  test('counts the Works kept Private', async () => {
    fakeServer({ ...allPrivate, privateWorks: ['wd:Q1', 'wd:Q2'] });

    expect(await screen.findByText('2 Works kept Private, from their book page.')).toBeTruthy();
  });
});

test('an unshared category whose records the PDS still holds says so next to its switch', async () => {
  fakeServer({ ...allPrivate, shared: { ...allPrivate.shared, labels: true }, pending: true });

  const statuses = await screen.findByRole('switch', { name: 'Reading Statuses' });
  expect(statuses.getAttribute('aria-describedby')).toBe('sharing-readingStatuses-state');
  expect(document.getElementById('sharing-readingStatuses-state')!.textContent).toBe('Still on your AT Protocol account: Atomes tries again.');
  expect(document.getElementById('sharing-labels-state')!.textContent).toBe('Shared: public on your AT Protocol account. Anyone can read them, with no Atomes account.');
});
