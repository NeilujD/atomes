// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import { openOwnSpace } from './server-client';

afterEach(() => vi.unstubAllGlobals());

test('an open that failed is tried again on the next ask; once open, the page shares one store', async () => {
  // The session check fails once (the server is restarting), then answers.
  const answers = [new Response(null, { status: 500 }), Response.json({ did: 'did:plc:reader', handle: 'reader.example' })];
  vi.stubGlobal('fetch', () => Promise.resolve(answers.shift()));

  await expect(openOwnSpace()).rejects.toThrow('HTTP 500');

  const own = await openOwnSpace();

  expect(own?.account).toEqual({ did: 'did:plc:reader', handle: 'reader.example' });
  expect(await openOwnSpace()).toBe(own);
});
