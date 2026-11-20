import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import Welcome from './welcome.astro';

// LANDING_PAGE (M12, CORE-158): off by default, so each test turns the Landing page on first.
beforeEach(() => {
  vi.stubEnv('LANDING_PAGE', 'on');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test('the Landing page opens with no session', async () => {
  const container = await AstroContainer.create();

  const response = await container.renderToResponse(Welcome);

  expect(response.status).toBe(200);
  expect(await response.text()).toContain('<h1 id="hero-title"');
});

test('LANDING_PAGE=off: /welcome answers 404', async () => {
  vi.stubEnv('LANDING_PAGE', 'off');
  const container = await AstroContainer.create();

  const response = await container.renderToResponse(Welcome);

  expect(response.status).toBe(404);
});

// The share preview (CORE-161): a chat or a social network reads these tags.
test('the share preview names the page and its picture with addresses on the instance origin', async () => {
  vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://books.example.org');
  const container = await AstroContainer.create();

  const html = await (await container.renderToResponse(Welcome, { request: new Request('http://127.0.0.1:4321/welcome') })).text();

  const meta = (key: string) => new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`).exec(html)?.[1];
  expect(meta('og:title')).toBe('Atomes · Your books and manga, on your own terms');
  expect(meta('og:description')).toMatch(/^Atomes keeps your Library/);
  expect(meta('og:url')).toBe('https://books.example.org/welcome');
  expect(meta('og:image')).toBe('https://books.example.org/landing/en/preview.jpg');
  expect(meta('twitter:card')).toBe('summary_large_image');
  expect(meta('twitter:image')).toBe('https://books.example.org/landing/en/preview.jpg');
  expect(html).toContain('<link rel="canonical" href="https://books.example.org/welcome">');
});

// CORE-159: the language the app chooses (the Settings cookie, else the browser's), with its own preview picture.
test('a visitor who chose French reads the page in French, with the French preview picture', async () => {
  vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://books.example.org');
  const container = await AstroContainer.create();
  const request = new Request('http://127.0.0.1:4321/welcome', { headers: { cookie: 'atomes-language=fr', 'accept-language': 'en-US' } });

  const html = await (await container.renderToResponse(Welcome, { request })).text();

  expect(html).toContain('<html lang="fr"');
  expect(html).toContain('content="https://books.example.org/landing/fr/preview.jpg"');
  expect(html).toContain('src="/landing/fr/library-desktop-light.webp"');
  // The switch offers the other language.
  expect(html).toMatch(/<button [^>]*lang="en" data-language="en"/);
});
