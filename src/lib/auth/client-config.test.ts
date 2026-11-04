import { describe, expect, test } from 'vitest';
import { isLoopbackHost, webClientMetadata } from './client-config';

describe('webClientMetadata', () => {
  test('is a public, DPoP-bound web client whose id and callback sit on the app origin', () => {
    const metadata = webClientMetadata('https://mymac.tail1234.ts.net/ignored/path');

    expect(metadata).toMatchObject({
      client_id: 'https://mymac.tail1234.ts.net/oauth/client-metadata.json',
      application_type: 'web',
      redirect_uris: ['https://mymac.tail1234.ts.net/oauth/callback'],
      scope: 'atproto space:app.atomes.library?skey=self&manage=create',
      token_endpoint_auth_method: 'none',
      dpop_bound_access_tokens: true,
    });
  });

  test.each(['http://mymac.tail1234.ts.net', 'not a url'])('refuses %o', (origin) => {
    expect(() => webClientMetadata(origin)).toThrow();
  });
});

describe('isLoopbackHost', () => {
  test.each([
    ['127.0.0.1', true],
    ['[::1]', true],
    ['localhost', false],
    ['mymac.tail1234.ts.net', false],
  ])('%s gives %s', (hostname, loopback) => {
    expect(isLoopbackHost(hostname)).toBe(loopback);
  });
});
