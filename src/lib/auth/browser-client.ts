// The real AuthClient: an AT Protocol OAuth public client in the browser (ADR 0009).
// Tokens and the DPoP key stay in IndexedDB on this device; the Atomes server never sees them.
import {
  AtprotoDohHandleResolver,
  BrowserOAuthClient,
  atprotoLoopbackClientMetadata,
  buildAtprotoLoopbackClientId,
} from '@atproto/oauth-client-browser';
import { callbackPath, isLoopbackHost, metadataPath, oauthScope } from './client-config';
import type { Account, AuthClient } from './session';
import { openSpace, type Space } from '../space/space';

// Resolves handles over DNS-over-HTTPS, so Bluesky does not learn who signs in.
// Needs a server that answers JSON DoH queries with CORS.
const dohEndpoint = 'https://cloudflare-dns.com/dns-query';

const options = {
  handleResolver: new AtprotoDohHandleResolver({ dohEndpoint }),
  // The authorization code comes back in the URL fragment, which the browser
  // never sends to the Atomes server.
  responseMode: 'fragment',
} as const;

// Local development: the loopback client, with the app on 127.0.0.1.
export function loopbackClientMetadata(origin: string) {
  const redirectUri = new URL(callbackPath, origin).href;
  return atprotoLoopbackClientMetadata(buildAtprotoLoopbackClientId({ scope: oauthScope, redirect_uris: [redirectUri] }));
}

async function loadClient(): Promise<BrowserOAuthClient> {
  // The loopback client refuses `localhost`: move to the same page on 127.0.0.1.
  if (location.hostname === 'localhost') {
    const url = new URL(location.href);
    url.hostname = '127.0.0.1';
    location.replace(url);
    return new Promise(() => {});
  }

  return isLoopbackHost(location.hostname)
    ? new BrowserOAuthClient({ ...options, clientMetadata: loopbackClientMetadata(location.origin) })
    : await BrowserOAuthClient.load({ ...options, clientId: new URL(metadataPath, location.origin).href });
}

// Restores the stored session and opens the reader's private Space with it.
// Undefined when signed out.
export async function openOwnSpace(): Promise<{ account: Account; space: Space } | undefined> {
  const client = await loadClient();
  const result = await client.init();
  if (!result) return undefined;
  const { session } = result;
  return {
    account: await toAccount(client, session.did),
    space: openSpace((pathname, init) => session.fetchHandler(pathname, init), session.did),
  };
}

export async function createAuthClient(): Promise<AuthClient> {
  const client = await loadClient();

  return {
    async init() {
      const result = await client.init();
      return result && toAccount(client, result.session.did);
    },
    async signIn(handle) {
      await client.signIn(handle, { scope: oauthScope });
    },
    async signOut(did) {
      // Deletes the stored session even when the revoke call fails.
      await client.revoke(did);
    },
  };
}

async function toAccount(client: BrowserOAuthClient, did: string): Promise<Account> {
  try {
    const { handle } = await client.oauthResolver.resolveIdentity(did);
    if (handle !== 'handle.invalid') return { did, handle };
  } catch {
    // Offline or resolver down: the DID still names the account.
  }
  return { did, handle: did };
}
