import { describe, expect, test, vi } from 'vitest';
import { guard, isSameOrigin } from './security';

const app = 'https://atomes.test';
const page = () => new Response('<!doctype html><title>Atomes</title>', { headers: { 'content-type': 'text/html' } });
const json = () => Response.json({ ok: true });

function write(origin: string | null, method = 'POST') {
  return new Request(`${app}/api/library/records`, { method, headers: origin ? { origin } : {} });
}

describe('guard: writes from other sites', () => {
  test.each([
    ['https://evil.test', 'POST'],
    [null, 'POST'],
    ['https://evil.test', 'PUT'],
    [null, 'DELETE'],
    ['https://atomes.test.evil.test', 'PATCH'],
  ])('Origin %s on %s gets 403 and never reaches the route', async (origin, method) => {
    const next = vi.fn(() => Promise.resolve(json()));

    const response = await guard(write(origin, method), next, app);

    expect(response.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  test('a write from the app origin reaches the route', async () => {
    const response = await guard(write(app), () => Promise.resolve(json()), app);

    expect(response.status).toBe(200);
  });

  test('a read needs no Origin', async () => {
    const response = await guard(new Request(`${app}/api/session`), () => Promise.resolve(json()), app);

    expect(response.status).toBe(200);
  });
});

describe('guard: security headers', () => {
  test('an API answer gets a CSP that loads nothing and cannot be framed', async () => {
    const response = await guard(new Request(`${app}/api/session`), () => Promise.resolve(json()), app);

    expect(response.headers.get('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('same-origin');
  });

  test("a page keeps Astro's CSP and gets the other headers", async () => {
    const astroPolicy = "default-src 'self'; frame-ancestors 'none'; script-src 'self' 'sha256-abc'";
    const withPolicy = () => {
      const response = page();
      response.headers.set('content-security-policy', astroPolicy);
      return Promise.resolve(response);
    };

    const response = await guard(new Request(`${app}/`), withPolicy, app);

    expect(response.headers.get('content-security-policy')).toBe(astroPolicy);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('same-origin');
  });

  // Astro adds its CSP to built pages only (not in `astro dev`): there a page
  // still cannot be framed, and Vite's inline scripts keep working.
  test('a page with no CSP of its own still cannot be framed', async () => {
    const response = await guard(new Request(`${app}/`), () => Promise.resolve(page()), app);

    expect(response.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
  });
});

describe('isSameOrigin', () => {
  test.each([
    [app, true],
    ['https://evil.test', false],
    [null, false],
  ])('Origin %s gives %s', (origin, same) => {
    const request = new Request('http://10.0.0.5:4321/oauth/sign-out', { method: 'POST', headers: origin ? { origin } : {} });
    expect(isSameOrigin(request, app)).toBe(same);
  });

  test('in local development, the origin of the request', () => {
    const request = new Request('http://127.0.0.1:4321/oauth/sign-out', { method: 'POST', headers: { origin: 'http://127.0.0.1:4321' } });
    expect(isSameOrigin(request)).toBe(true);
  });

  test('in local development, the Host header wins over a request URL on localhost', () => {
    const headers = { host: '127.0.0.1:4321', origin: 'http://127.0.0.1:4321' };
    expect(isSameOrigin(new Request('http://localhost:4321/oauth/sign-out', { method: 'POST', headers }))).toBe(true);
    const other = { host: '127.0.0.1:4321', origin: 'http://localhost:4321' };
    expect(isSameOrigin(new Request('http://localhost:4321/oauth/sign-out', { method: 'POST', headers: other }))).toBe(false);
  });
});
