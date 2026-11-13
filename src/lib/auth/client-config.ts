// OAuth client settings of the server (ADR 0013). Plain data: no OAuth library
// import, so the metadata endpoint and the tests use it as is.
import { sharedCollections } from '../sharing/categories';

// Create, update and delete on the Shared record collections only: no Space
// scope, no blob scope, no published lexicon needed (spike 0003, section 3).
export const oauthScope =
  'atproto repo?collection=app.atomes.readingStatus&collection=app.atomes.label&collection=app.atomes.follow';

// Whether a granted scope lets the server share: create, update and delete
// on every Shared record collection. A session keeps the scope of its sign-in
// (spike 0003, section 3), so a reader whose session lacks it signs in again.
export function grantsSharing(scope: string): boolean {
  const parts = scope.split(' ');
  if (!parts.includes('atproto')) return false;
  if (parts.includes('transition:generic')) return true;
  const allowed = new Set<string>();
  for (const part of parts) {
    const match = /^repo(?::([^?]*))?(?:\?(.*))?$/.exec(part);
    if (!match) continue;
    const params = new URLSearchParams(match[2] ?? '');
    const actions = params.getAll('action');
    if (actions.length > 0 && !['create', 'update', 'delete'].every((action) => actions.includes(action))) continue;
    for (const collection of [match[1], ...params.getAll('collection')]) if (collection) allowed.add(collection);
  }
  return allowed.has('*') || sharedCollections.every((collection) => allowed.has(collection));
}

export const callbackPath = '/oauth/callback';
export const metadataPath = '/oauth/client-metadata.json';
export const jwksPath = '/oauth/jwks.json';

// Metadata of the confidential client, served at `metadataPath`. Built from
// PUBLIC_APP_ORIGIN, never from the request Host header. The PDS checks the
// client's signed assertions with the public key at `jwksPath`.
export function confidentialClientMetadata(appOrigin: string) {
  const url = new URL(appOrigin);
  if (url.protocol !== 'https:') throw new Error(`PUBLIC_APP_ORIGIN must use https: ${appOrigin}`);
  const origin = url.origin;
  return {
    client_id: `${origin}${metadataPath}`,
    client_name: 'Atomes',
    client_uri: origin,
    application_type: 'web',
    redirect_uris: [`${origin}${callbackPath}`],
    scope: oauthScope,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'private_key_jwt',
    token_endpoint_auth_signing_alg: 'ES256',
    jwks_uri: `${origin}${jwksPath}`,
    dpop_bound_access_tokens: true,
  } as const;
}
