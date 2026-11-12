import { afterEach, expect, test, vi } from 'vitest';
import { GET } from './manifest.webmanifest';

afterEach(() => {
  vi.unstubAllEnvs();
});

async function manifestOf(env: Record<string, string | undefined>): Promise<Record<string, unknown>> {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  const response = await GET({} as Parameters<typeof GET>[0]);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('application/manifest+json');
  return (await response.json()) as Record<string, unknown>;
}

test('production: the manifest of the installed app, unchanged', async () => {
  expect(await manifestOf({ APP_ENV: 'production', NODE_ENV: 'production' })).toEqual({
    id: '/',
    name: 'Atomes',
    short_name: 'Atomes',
    description: 'Your books, series and volumes. Private by default.',
    lang: 'en',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f6f6f3',
    theme_color: '#f6f6f3',
    icons: [
      { src: '/icons/atomes-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/atomes-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/atomes-icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/atomes-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  });
});

test('staging: its own name and its own icons', async () => {
  const manifest = await manifestOf({ APP_ENV: 'staging', NODE_ENV: 'production' });

  expect(manifest).toMatchObject({ name: 'Atomes Staging', short_name: 'Atomes Staging', start_url: '/' });
  expect(manifest.icons).toEqual([
    { src: '/icons/atomes-icon-staging-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/atomes-icon-staging-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/atomes-icon-staging-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: '/icons/atomes-icon-staging-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ]);
});

test('a preview and the dev server name themselves', async () => {
  const preview = await manifestOf({ APP_ENV: 'staging', COOLIFY_BRANCH: 'pull/34/head', NODE_ENV: 'production' });
  expect(preview.name).toBe('Atomes Preview');

  vi.unstubAllEnvs();
  expect((await manifestOf({ NODE_ENV: 'development' })).name).toBe('Atomes Local');
});
