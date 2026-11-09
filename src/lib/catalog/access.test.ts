import { describe, expect, test } from 'vitest';
import { checkAccess, clientIp, createIpLimit, type CatalogAccess } from './access';

const request = (headers: Record<string, string> = {}) => new Request('http://catalog.test/api/catalog/editions/9782723478991', { headers });

function setup(signedIn = false) {
  let clock = 0;
  const access: CatalogAccess = {
    limit: createIpLimit({ max: 3, windowMs: 60_000, now: () => clock }),
    signedIn: () => signedIn,
  };
  const wait = (ms: number) => (clock += ms);
  return { access, wait };
}

const status = (result: ReturnType<typeof checkAccess>) => ('refused' in result ? result.refused.status : 200);

describe('the client IP behind the proxy (one hop trusted)', () => {
  test('is the address the proxy adds last to X-Forwarded-For', () => {
    expect(clientIp(request({ 'x-forwarded-for': '203.0.113.7' }), '10.0.1.5')).toBe('203.0.113.7');
  });

  test('a forged extra hop sent by the client is ignored', () => {
    expect(clientIp(request({ 'x-forwarded-for': '198.51.100.1, 203.0.113.7' }), '10.0.1.5')).toBe('203.0.113.7');
  });

  test('with no proxy (local development) it is the address of the connection', () => {
    expect(clientIp(request(), '127.0.0.1')).toBe('127.0.0.1');
  });
});

describe('ISBN lookups: a limit per IP address', () => {
  test('over the limit the answer is 429 with Retry-After, and the limit resets after the window', () => {
    const { access, wait } = setup();
    const from = request({ 'x-forwarded-for': '203.0.113.7' });

    expect([1, 2, 3].map(() => status(checkAccess(from, undefined, access)))).toEqual([200, 200, 200]);
    wait(20_000);
    const result = checkAccess(from, undefined, access);

    expect('refused' in result && result.refused.status).toBe(429);
    expect('refused' in result && result.refused.headers.get('retry-after')).toBe('40');
    wait(40_000);
    expect(status(checkAccess(from, undefined, access))).toBe(200);
  });

  test('each IP has its own limit, whatever extra hop the client forges', () => {
    const { access } = setup();
    for (let i = 0; i < 3; i++) checkAccess(request({ 'x-forwarded-for': `198.51.100.${i}, 203.0.113.7` }), undefined, access);

    expect(status(checkAccess(request({ 'x-forwarded-for': '198.51.100.9, 203.0.113.7' }), undefined, access))).toBe(429);
    expect(status(checkAccess(request({ 'x-forwarded-for': '203.0.113.8' }), undefined, access))).toBe(200);
  });

  test('a signed-in reader is not limited and may start a fill', () => {
    const { access } = setup(true);
    const from = request({ 'x-forwarded-for': '203.0.113.7' });

    const results = [1, 2, 3, 4, 5].map(() => checkAccess(from, undefined, access));

    expect(results.map(status)).toEqual([200, 200, 200, 200, 200]);
    expect(results.at(-1)).toEqual({ signedIn: true });
  });

  test('anyone else may not start a fill', () => {
    const { access } = setup(false);

    expect(checkAccess(request(), '127.0.0.1', access)).toEqual({ signedIn: false });
  });
});
