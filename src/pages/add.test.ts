import { expect, test } from 'vitest';
import { GET } from './add';

const get = (url: string) => GET({ url: new URL(url) } as Parameters<typeof GET>[0]) as Promise<Response>;

test('an old Quick Add link opens Check a book with its ISBN', async () => {
  const response = await get('http://127.0.0.1:4321/add?isbn=9782723488525');

  expect(response.status).toBe(301);
  expect(response.headers.get('location')).toBe('/check?isbn=9782723488525');
});

test('the Quick Add address with no ISBN opens Check a book', async () => {
  expect((await get('http://127.0.0.1:4321/add')).headers.get('location')).toBe('/check');
});
