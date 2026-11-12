import { afterEach, expect, test, vi } from 'vitest';
import { GET } from './sign-in-as';

afterEach(() => {
  vi.unstubAllEnvs();
});

test('a built server answers 404 and opens no session', async () => {
  vi.stubEnv('DEV', false);

  const response = await GET({ request: new Request('http://127.0.0.1:4321/dev/sign-in-as') } as Parameters<typeof GET>[0]);

  expect(response.status).toBe(404);
  expect(response.headers.get('set-cookie')).toBeNull();
});
