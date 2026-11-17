import { expect, test } from 'vitest';
import { t } from '../i18n/i18n';
import { deleteAccount } from './delete-account';
import { accountKey } from './gate-boot';
import { signInResultMessage } from './session';

// The device after "Delete my account": its saved Account and Library copy,
// and a server that answers the delete as `answer` says (undefined: offline).
function device(answer?: Response) {
  const storage = new Map([[accountKey, '{"id":"account-reader"}']]);
  const state = { cleared: false, posted: [] as string[] };
  const deps = {
    fetch: (input: string, init?: RequestInit) => {
      state.posted.push(`${init?.method} ${input}`);
      return answer ? Promise.resolve(answer) : Promise.reject(new TypeError('Failed to fetch'));
    },
    storage: { removeItem: (key: string) => void storage.delete(key) },
    device: {
      clear: () => {
        state.cleared = true;
        return Promise.resolve();
      },
    },
  };
  return { deps, storage, state };
}

test('deleted: the device forgets the Account and its Library, and the sign-in screen says so', async () => {
  const { deps, storage, state } = device(Response.json({ sharedLeft: false }));

  const result = await deleteAccount(deps);

  expect(state.posted).toEqual(['POST /api/account/delete']);
  expect(storage.has(accountKey)).toBe(false);
  expect(state.cleared).toBe(true);
  expect(result).toEqual({ next: '/sign-in?auth=deleted' });
  expect(signInResultMessage('deleted')).toBe(t('auth.account-deleted'));
});

test('deleted with the PDS out of reach: the sign-in screen says the Shared records are still to be removed', async () => {
  const { deps } = device(Response.json({ sharedLeft: true }));

  const result = await deleteAccount(deps);

  expect(result).toEqual({ next: '/sign-in?auth=deleted-shared-left' });
  expect(signInResultMessage('deleted-shared-left')).toBe(t('auth.account-deleted-shared-left'));
});

test('not deleted (offline, or the server refused): the device keeps everything and Settings says so', async () => {
  for (const answer of [undefined, new Response(null, { status: 500 })]) {
    const { deps, storage, state } = device(answer);

    expect(await deleteAccount(deps)).toEqual({ message: t('settings.delete-failed') });
    expect(storage.has(accountKey)).toBe(true);
    expect(state.cleared).toBe(false);
  }
});
