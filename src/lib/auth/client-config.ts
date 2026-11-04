// OAuth client settings, shared by the browser client and the metadata endpoint
// (ADR 0009). Plain data: no OAuth library import, so the server can use it.

// `atproto` only for now: the Space scope (`space:app.atomes.library?...`) gives
// `invalid_scope` until the `app.atomes.*` lexicons are published (CORE-17).
export const oauthScope = 'atproto';
export const callbackPath = '/oauth/callback';
export const metadataPath = '/oauth/client-metadata.json';

// The loopback client (local development) only accepts an app served on a
// loopback IP, never on `localhost` (docs/spikes/0001-oauth-and-spaces-alpha.md).
export function isLoopbackHost(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === '[::1]';
}

// Metadata of a public web client, served at `metadataPath` and given as is to
// the browser client, so the two cannot drift. Built from PUBLIC_APP_ORIGIN,
// never from the request Host header.
export function webClientMetadata(appOrigin: string) {
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
    token_endpoint_auth_method: 'none',
    dpop_bound_access_tokens: true,
  } as const;
}
