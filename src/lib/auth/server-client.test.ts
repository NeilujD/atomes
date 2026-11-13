// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest';
import { openOwnSpace, serverAuthClient } from './server-client';
import { gate } from './session';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('an open that failed is tried again on the next ask; once open, the page shares one store', async () => {
  // The session check fails once (the server is restarting), then answers.
  const answers = [new Response(null, { status: 500 }), Response.json({ did: 'did:plc:reader', handle: 'reader.example' })];
  vi.stubGlobal('fetch', () => Promise.resolve(answers.shift()));

  await expect(openOwnSpace()).rejects.toThrow('HTTP 500');

  const own = await openOwnSpace();

  expect(own?.account).toEqual({ did: 'did:plc:reader', handle: 'reader.example' });
  expect(await openOwnSpace()).toBe(own);
});

describe('a session check the server never answers', () => {
  // The time limit is already over; the browser then rejects the fetch
  // (WebKit with an AbortError, others with a TimeoutError).
  function clientWith(saved: string | null) {
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.abort(new DOMException('Timed out', 'TimeoutError')));
    const storage = { getItem: () => saved, setItem: () => {}, removeItem: () => {} };
    const fetch = () => Promise.reject(new DOMException('Fetch is aborted', 'AbortError'));
    return serverAuthClient({ fetch, storage, submitSignIn: () => {} });
  }

  test('sends a visitor with no saved account to the sign-in screen', async () => {
    expect(await gate(clientWith(null), '/library')).toBe('/sign-in?next=%2Flibrary');
  });

  test('opens the account the device saw last, as offline', async () => {
    const account = { did: 'did:plc:reader', handle: 'reader.example' };
    expect(await clientWith(JSON.stringify(account)).init()).toEqual(account);
  });
});
