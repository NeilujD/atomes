import { afterEach, expect, test, vi } from 'vitest';
import { outbox } from '../../lib/server/instance';
import { GET } from './outbox';

afterEach(() => {
  vi.unstubAllEnvs();
});

const ask = (to: string) => GET({ url: new URL(`http://127.0.0.1:4321/dev/outbox?to=${encodeURIComponent(to)}`) } as Parameters<typeof GET>[0]);

test('the dev server gives the last mail of the address, as plain text', async () => {
  vi.stubEnv('DEV', true);
  await outbox.send({ to: 'reader@example.org', subject: 'S', text: 'Your code: 123456' });

  const response = await ask(' Reader@Example.org');

  expect(response.status).toBe(200);
  expect(await response.text()).toBe('Your code: 123456');
});

test('a built server answers 404 and shows no mail', async () => {
  vi.stubEnv('DEV', false);
  await outbox.send({ to: 'reader@example.org', subject: 'S', text: 'Your code: 123456' });

  const response = await ask('reader@example.org');

  expect(response.status).toBe(404);
  expect(await response.text()).toBe('');
});
