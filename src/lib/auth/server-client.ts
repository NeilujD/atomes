// The real AuthClient: the Atomes server signs the reader in (ADR 0013). The
// device keeps only the account it saw last (DID and handle, no token), so the
// session still opens offline (ADR 0002).
import { isNetworkFailure } from '../network';
import { indexedDbLocalCopy } from '../space/local-copy';
import { instanceFetch, openInstanceStore } from '../space/instance-store';
import type { Space } from '../space/space';
import type { Account, AuthClient } from './session';

const accountKey = 'atomes-account';

export interface ServerClientDeps {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  // Posts the sign-in form: the page leaves.
  submitSignIn: (handle: string) => void;
}

export function serverAuthClient(deps: ServerClientDeps): AuthClient {
  function saved(): Account | undefined {
    const value = deps.storage.getItem(accountKey);
    return value ? (JSON.parse(value) as Account) : undefined;
  }

  return {
    async init() {
      let response: Response;
      try {
        response = await deps.fetch('/api/session', { cache: 'no-store', credentials: 'same-origin' });
      } catch (error) {
        if (!isNetworkFailure(error)) throw error;
        // Offline: the device copy and the write queue still work (ADR 0013).
        const account = saved();
        if (!account) throw error;
        return account;
      }
      if (response.status === 401) {
        deps.storage.removeItem(accountKey);
        return undefined;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status} for /api/session`);
      const { did, handle } = (await response.json()) as Account;
      deps.storage.setItem(accountKey, JSON.stringify({ did, handle }));
      return { did, handle };
    },
    signIn(handle) {
      deps.submitSignIn(handle);
      // The page leaves for the PDS.
      return new Promise(() => {});
    },
    async signOut() {
      deps.storage.removeItem(accountKey);
      const response = await deps.fetch('/oauth/sign-out', { method: 'POST', credentials: 'same-origin' });
      if (!response.ok) throw new Error(`HTTP ${response.status} for /oauth/sign-out`);
    },
  };
}

function submitSignIn(handle: string) {
  const form = document.createElement('form');
  form.method = 'post';
  form.action = '/oauth/sign-in';
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'handle';
  input.value = handle;
  form.append(input);
  document.body.append(form);
  form.submit();
}

export function createAuthClient(): AuthClient {
  return serverAuthClient({ fetch: (input, init) => fetch(input, init), storage: localStorage, submitSignIn });
}

// The signed-in reader and their Library store on this instance. Undefined when signed out.
export async function openOwnSpace(): Promise<{ account: Account; space: Space } | undefined> {
  const account = await createAuthClient().init();
  if (!account) return undefined;
  return { account, space: openInstanceStore(instanceFetch, account.did, indexedDbLocalCopy()) };
}
