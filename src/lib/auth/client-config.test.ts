import { describe, expect, test } from 'vitest';
import { confidentialClientMetadata, grantsSharing, oauthScope } from './client-config';

describe('confidentialClientMetadata', () => {
  test('is a confidential, DPoP-bound web client whose id, callback and keys sit on the app origin', () => {
    const metadata = confidentialClientMetadata('https://mymac.tail1234.ts.net/ignored/path');

    expect(metadata).toMatchObject({
      client_id: 'https://mymac.tail1234.ts.net/oauth/client-metadata.json',
      application_type: 'web',
      redirect_uris: ['https://mymac.tail1234.ts.net/oauth/callback'],
      token_endpoint_auth_method: 'private_key_jwt',
      token_endpoint_auth_signing_alg: 'ES256',
      jwks_uri: 'https://mymac.tail1234.ts.net/oauth/jwks.json',
      dpop_bound_access_tokens: true,
    });
  });

  test('asks only for the Shared record collections: no Space, no blob, no generic scope', () => {
    const scopes = confidentialClientMetadata('https://atomes.example.org').scope.split(' ');

    expect(scopes).toEqual([
      'atproto',
      'repo?collection=app.atomes.readingStatus&collection=app.atomes.label&collection=app.atomes.follow',
    ]);
  });

  test.each(['http://mymac.tail1234.ts.net', 'not a url'])('refuses %o', (origin) => {
    expect(() => confidentialClientMetadata(origin)).toThrow();
  });
});

describe('grantsSharing', () => {
  test('the scope Atomes asks for allows sharing', () => {
    expect(grantsSharing(oauthScope)).toBe(true);
  });

  test.each([
    'atproto repo:app.atomes.readingStatus repo:app.atomes.label repo:app.atomes.follow',
    'atproto repo:app.atomes.readingStatus?action=create&action=update&action=delete repo?collection=app.atomes.label&collection=app.atomes.follow',
    'atproto repo:*',
    'atproto transition:generic',
  ])('allows sharing with %o', (scope) => {
    expect(grantsSharing(scope)).toBe(true);
  });

  test.each([
    ['no repo scope', 'atproto'],
    ['a collection missing', 'atproto repo?collection=app.atomes.readingStatus&collection=app.atomes.label'],
    ['no delete, so no unshare', 'atproto repo?collection=app.atomes.readingStatus&collection=app.atomes.label&collection=app.atomes.follow&action=create&action=update'],
    ['no atproto scope', 'repo?collection=app.atomes.readingStatus&collection=app.atomes.label&collection=app.atomes.follow'],
  ])('refuses %s', (_, scope) => {
    expect(grantsSharing(scope)).toBe(false);
  });
});
