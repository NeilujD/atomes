// Loads the OAuth client metadata that this Atomes server publishes (ADR 0009).
// `BrowserOAuthClient.load` does the same, but every failure there is a
// TypeError, so the reader saw "Could not reach your PDS" for a server set up
// wrongly. Here the two failures stay apart. The client constructor still
// validates the metadata.
import type { OAuthClientMetadataInput } from '@atproto/oauth-client-browser';

// `reachable`: the server answered, but its metadata cannot be used
// (PUBLIC_APP_ORIGIN missing, not https, or naming another host).
export class ClientMetadataError extends Error {
  constructor(
    readonly reachable: boolean,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ClientMetadataError';
  }
}

export async function fetchClientMetadata(url: string, fetchFn: typeof fetch = fetch): Promise<OAuthClientMetadataInput> {
  let response: Response;
  try {
    response = await fetchFn(url, { redirect: 'error' });
  } catch (cause) {
    throw new ClientMetadataError(false, `Could not load ${url}`, { cause });
  }
  if (!response.ok) throw new ClientMetadataError(true, `HTTP ${response.status} for ${url}`);

  let metadata: OAuthClientMetadataInput;
  try {
    metadata = (await response.json()) as OAuthClientMetadataInput;
  } catch (cause) {
    throw new ClientMetadataError(true, `${url} is not JSON`, { cause });
  }
  // A client ID is the URL of its metadata: another value means PUBLIC_APP_ORIGIN
  // names another host, and the PDS would refuse the sign-in.
  if (metadata.client_id !== url) throw new ClientMetadataError(true, `${url} names client ${metadata.client_id}`);
  return metadata;
}
