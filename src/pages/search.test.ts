import { expect, test } from 'vitest';
import { GET } from './search';

const get = (url: string) => GET({ url: new URL(url) } as Parameters<typeof GET>[0]) as Promise<Response>;

test('an old Search link opens Check a book in Search mode', async () => {
  const response = await get('http://127.0.0.1:4321/search');

  expect(response.status).toBe(301);
  expect(response.headers.get('location')).toBe('/check?mode=search');
});

test('an old Search link keeps its words', async () => {
  expect((await get('http://127.0.0.1:4321/search?q=dix+petits')).headers.get('location')).toBe('/check?mode=search&q=dix+petits');
});
