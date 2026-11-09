// The real OAuthPort: `@atproto/oauth-client-node` (ADR 0013, spike 0003). The
// only file that knows the OAuth library. Handles are resolved by this server
// (DNS and https), so Bluesky does not learn who signs in.
// - With PUBLIC_APP_ORIGIN: a confidential client (`private_key_jwt`, ES256).
// - Without it (local development): the loopback public client on 127.0.0.1.
import {
  JoseKey,
  NodeOAuthClient,
  OAuthCallbackError,
  OAuthResolverError,
  buildAtprotoLoopbackClientMetadata,
  requestLocalLock,
  type NodeSavedSession,
  type NodeSavedState,
} from '@atproto/oauth-client-node';
import { callbackPath, confidentialClientMetadata, oauthScope } from '../auth/client-config';
import { isNetworkFailure } from '../network';
import { NotAllowedError, type AuthStore } from './auth-store';
import { SignInError, type OAuthPort } from './auth';
import type { Settings } from './settings';

export async function createOAuthClient(settings: Settings, store: AuthStore): Promise<NodeOAuthClient> {
  const stores = {
    stateStore: store.states<NodeSavedState>(),
    sessionStore: store.sessions<NodeSavedSession>(),
    // One process per instance (ADR 0007): two refreshes at once would revoke the session.
    requestLock: requestLocalLock,
  };
  if (!settings.appOrigin) {
    return new NodeOAuthClient({
      ...stores,
      clientMetadata: buildAtprotoLoopbackClientMetadata({
        scope: oauthScope,
        redirect_uris: [`http://127.0.0.1:${settings.port}${callbackPath}`],
      }),
    });
  }
  // settings.ts checked that the key is there with an https origin.
  const jwk = JSON.parse(settings.oauthPrivateKey!) as Parameters<typeof JoseKey.fromJWK>[0];
  const metadata = confidentialClientMetadata(settings.appOrigin);
  return new NodeOAuthClient({
    ...stores,
    // The library takes mutable arrays.
    clientMetadata: {
      ...metadata,
      redirect_uris: [...metadata.redirect_uris],
      grant_types: [...metadata.grant_types],
      response_types: [...metadata.response_types],
    },
    keyset: [await JoseKey.fromJWK(jwk)],
  });
}

function signInError(error: unknown): unknown {
  if (error instanceof NotAllowedError || error instanceof SignInError) return error;
  if (error instanceof OAuthCallbackError && error.params.get('error') === 'access_denied') {
    return new SignInError('cancelled', { cause: error });
  }
  if (error instanceof OAuthResolverError) return new SignInError('no-account', { cause: error });
  if (isNetworkFailure(error)) return new SignInError('unreachable', { cause: error });
  return error;
}

export function oauthPort(client: NodeOAuthClient, allowedDids: ReadonlySet<string>): OAuthPort {
  return {
    async authorize(handle) {
      try {
        // Refused before the PDS page: the reader does not sign in for nothing.
        // The session store refuses it again at the callback.
        const { did } = await client.oauthResolver.resolveIdentity(handle);
        if (!allowedDids.has(did)) throw new NotAllowedError(did);
        return await client.authorize(handle, { scope: oauthScope });
      } catch (error) {
        throw signInError(error);
      }
    },
    async callback(params) {
      try {
        const { session } = await client.callback(params);
        return { did: session.did };
      } catch (error) {
        throw signInError(error);
      }
    },
    async handleOf(did) {
      try {
        const { handle } = await client.oauthResolver.resolveIdentity(did);
        if (handle && handle !== 'handle.invalid') return handle;
      } catch {
        // The DID still names the account.
      }
      return did;
    },
    revoke: (did) => client.revoke(did),
  };
}
