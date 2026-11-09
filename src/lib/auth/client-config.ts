// OAuth client settings of the server (ADR 0013). Plain data: no OAuth library
// import, so the metadata endpoint and the tests use it as is.

// Create, update and delete on the Shared record collections only: no Space
// scope, no blob scope, no published lexicon needed (spike 0003, section 3).
export const oauthScope =
  'atproto repo?collection=app.atomes.readingStatus&collection=app.atomes.label&collection=app.atomes.follow';
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
