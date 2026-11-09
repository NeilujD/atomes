import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { createAuthStore } from './auth-store';
import { createOAuthClient } from './oauth';
import { secretBox } from './secret-box';
import { readSettings } from './settings';

// Built with a new key, as an https instance is; no PDS is called.
async function confidentialClient() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = { ...privateKey.export({ format: 'jwk' }), kid: randomUUID(), alg: 'ES256' };
  const settings = readSettings({
    PUBLIC_APP_ORIGIN: 'https://atomes.test',
    ALLOWED_DIDS: 'did:plc:owner',
    SESSION_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    OAUTH_PRIVATE_KEY: JSON.stringify(jwk),
  });
  const store = createAuthStore({ file: ':memory:', box: secretBox(settings.sessionKey), allowedDids: settings.allowedDids });
  return { client: await createOAuthClient(settings, store), jwk };
}

// /oauth/jwks.json serves `client.jwks`: the private part of the key must never be in it.
test('the served key set holds the public key only', async () => {
  const { client, jwk } = await confidentialClient();
  const served = JSON.parse(JSON.stringify(client.jwks)) as { keys: Record<string, unknown>[] };

  expect(served.keys).toHaveLength(1);
  expect(served.keys[0]).toMatchObject({ kty: 'EC', crv: 'P-256', kid: jwk.kid, x: jwk.x, y: jwk.y });
  expect(served.keys[0]).not.toHaveProperty('d');
  expect(JSON.stringify(served)).not.toContain(jwk.d);
});

test('the confidential client signs its assertions with private_key_jwt', async () => {
  const { client } = await confidentialClient();

  expect(client.clientMetadata).toMatchObject({
    client_id: 'https://atomes.test/oauth/client-metadata.json',
    token_endpoint_auth_method: 'private_key_jwt',
    jwks_uri: 'https://atomes.test/oauth/jwks.json',
  });
});
