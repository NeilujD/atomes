import { describe, expect, test } from 'vitest';
import { accountName, addAddress, askLinkCode, linkResultMessage } from './link';

// The link routes as the device sees them: one answer per call.
const answering = (status: number, body?: unknown) => {
  const asked: { url: string; body: unknown }[] = [];
  const fetch = (url: string, init?: RequestInit) => {
    asked.push({ url, body: JSON.parse(init?.body as string) });
    return Promise.resolve(body === undefined ? new Response(null, { status }) : Response.json(body, { status }));
  };
  return { fetch, asked };
};

describe('add an email address from Settings', () => {
  test('asks a code for the address as the server compares it', async () => {
    const server = answering(204);

    expect(await askLinkCode(server.fetch, ' Reader@Example.org ')).toEqual({ email: 'reader@example.org' });
    expect(server.asked).toEqual([{ url: '/api/link/code', body: { email: 'reader@example.org' } }]);
  });

  test('sends the code with its digits only, and is quiet when the address is added', async () => {
    const server = answering(204);

    expect(await addAddress(server.fetch, 'reader@example.org', ' 123 456 ')).toBeUndefined();
    expect(server.asked[0].body).toEqual({ email: 'reader@example.org', code: '123456' });
  });

  test.each([
    [400, 'WrongCode', 'This code is wrong or has expired. Check it, or ask for a new one.'],
    [409, 'Taken', 'This address belongs to another Atomes account. Nothing was changed.'],
    [409, 'HasEmail', 'Your account has an email address already.'],
    [429, 'TooMany', 'Too many tries. Wait a while, then try again.'],
  ])('%i %s says so in plain words', async (status, error, message) => {
    expect(await addAddress(answering(status, { error }).fetch, 'reader@example.org', '123456')).toBe(message);
  });
});

describe('what Settings tells after linking an AT Protocol Account', () => {
  test.each([
    ['linked', 'AT Protocol account linked. You can sign in with it, and share.'],
    ['taken', 'This AT Protocol account belongs to another Atomes account. Nothing was changed.'],
    ['other-session', 'This link was started in another browser or session. Start it again here.'],
  ])('%s', (result, message) => {
    expect(linkResultMessage(result)?.text).toBe(message);
  });

  test('a result that is not one gives nothing', () => {
    expect(linkResultMessage(null)).toBeUndefined();
    expect(linkResultMessage('<script>')).toBeUndefined();
  });
});

test('the Account shows its email address, or the handle when it has none', () => {
  expect(accountName({ id: 'a', handle: 'reader.test', email: 'reader@example.org' })).toBe('reader@example.org');
  expect(accountName({ id: 'a', handle: 'reader.test' })).toBe('@reader.test');
});
