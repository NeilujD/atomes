import { describe, expect, test, vi } from 'vitest';
import { ClientMetadataError, fetchClientMetadata } from './client-metadata';
import { webClientMetadata } from './client-config';

const url = 'https://mymac.tail1234.ts.net/oauth/client-metadata.json';

function answering(response: Response | Error) {
  return vi.fn<typeof fetch>(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)));
}

async function failure(fetchFn: typeof fetch): Promise<ClientMetadataError> {
  const error: unknown = await fetchClientMetadata(url, fetchFn).catch((cause: unknown) => cause);
  expect(error).toBeInstanceOf(ClientMetadataError);
  return error as ClientMetadataError;
}

describe('fetchClientMetadata', () => {
  test('returns the metadata this server publishes for its own origin', async () => {
    const metadata = webClientMetadata('https://mymac.tail1234.ts.net');

    await expect(fetchClientMetadata(url, answering(Response.json(metadata)))).resolves.toEqual(metadata);
  });

  test('the server cannot be reached', async () => {
    expect((await failure(answering(new TypeError('Failed to fetch')))).reachable).toBe(false);
  });

  test.each([
    ['PUBLIC_APP_ORIGIN is not set', new Response('not set', { status: 404 })],
    ['PUBLIC_APP_ORIGIN is not a valid origin', new Response(null, { status: 500 })],
    ['the answer is not JSON', new Response('<html></html>', { headers: { 'content-type': 'text/html' } })],
    ['PUBLIC_APP_ORIGIN names another host', Response.json(webClientMetadata('https://other.example'))],
  ])('the server answers but is not set up for sign-in: %s', async (_, response) => {
    expect((await failure(answering(response))).reachable).toBe(true);
  });
});
