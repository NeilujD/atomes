import { expect, test } from 'vitest';
import { GET } from './health';

test('health endpoint answers 200 without caching', async () => {
  const response = await GET({} as Parameters<typeof GET>[0]);

  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
});
