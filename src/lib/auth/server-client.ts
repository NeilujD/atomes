// The real AuthClient: the Atomes server signs the reader in (ADR 0013). The
// device keeps only the account it saw last (DID and handle, no token), so the
// session still opens offline (ADR 0002).
import { lookupEdition } from '../catalog/client';
import { staleNotice } from '../library/stale';
import { isNetworkFailure } from '../network';
import { toast } from '../toast';
import { indexedDbLocalCopy } from '../space/local-copy';
import { instanceFetch, openInstanceStore } from '../space/instance-store';
import type { Space } from '../space/space';
import { deviceData } from './device-data';
import { signInPath } from './return-to';
import { gate, signOut, type Account, type AuthClient } from './session';

const accountKey = 'atomes-account';

export interface ServerClientDeps {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  // Posts the sign-in form: the page leaves.
  submitSignIn: (handle: string, returnTo: string) => void;
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
    signIn(handle, returnTo) {
      deps.submitSignIn(handle, returnTo);
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

function submitSignIn(handle: string, returnTo: string) {
  const form = document.createElement('form');
  form.method = 'post';
  form.action = '/oauth/sign-in';
  for (const [name, value] of [
    ['handle', handle],
    ['next', returnTo],
  ]) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.append(input);
  }
  document.body.append(form);
  form.submit();
}

export function createAuthClient(): AuthClient {
  return serverAuthClient({ fetch: (input, init) => fetch(input, init), storage: localStorage, submitSignIn });
}

let checked: Promise<Account | undefined> | undefined;

// The session check of this page load: the gate (AppShell) and the screen
// share one ask to the server.
export function checkedAccount(): Promise<Account | undefined> {
  return (checked ??= createAuthClient().init());
}

// The gate of every app screen: a visitor with no session goes to the sign-in
// screen, which sends them back here after the sign-in.
export async function gateScreen(): Promise<void> {
  const href = await gate({ init: checkedAccount }, location.pathname + location.search + location.hash);
  if (href) location.replace(href);
}

// Signs the reader out of this device and the server (Settings, sidebar), then
// goes to the sign-in screen. Gives the message to show instead when something
// went wrong that the reader must read first: the page stays.
export async function signOutHere(): Promise<string | undefined> {
  const account = await checkedAccount().catch(() => undefined);
  const { message } = account ? await signOut(createAuthClient(), account, deviceData(indexedDbLocalCopy())) : {};
  if (!message) location.replace(signInPath);
  return message;
}

// The signed-in reader and their Library store on this instance. Undefined when
// signed out: the gate is sending the visitor to the sign-in screen.
// A change refused because another device changed the record first gets a
// toast that names the book (ADR 0012).
// One store per page load: the screens of a page (the Book page and its Labels
// island) share one write queue, so a waiting save is never sent twice.
export function openOwnSpace(): Promise<{ account: Account; space: Space } | undefined> {
  return (own ??= openStore());
}

let own: Promise<{ account: Account; space: Space } | undefined> | undefined;

async function openStore(): Promise<{ account: Account; space: Space } | undefined> {
  const account = await checkedAccount();
  if (!account) return undefined;
  const space = openInstanceStore(instanceFetch, account.did, indexedDbLocalCopy(), (write) => {
    void staleNotice(write, { space, lookup: lookupEdition }).then((text) => toast(text, { error: true }));
  });
  return { account, space };
}
