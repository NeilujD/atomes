// Caches the app shell so Atomes opens with no signal.
// Pages: network first, the cached copy when offline. Everything precached
// (built assets, icons): cache first; built asset names change with content.
// `astro build` replaces BUILD with the built assets and a version (astro.config.mjs).

const BUILD = { version: 'dev', assets: [] };
const CACHE = `atomes-shell-${BUILD.version}`;
// Every page that must open offline. A page cached only when visited is lost on
// the next deploy: the old worker caches it, then the new worker deletes that cache.
const SHELL = [
  '/',
  '/settings',
  '/dev/space',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/favicon-32.png',
  '/apple-touch-icon-180.png',
  '/icons/atomes-icon-192.png',
  '/icons/atomes-icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([...SHELL, ...BUILD.assets]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith('atomes-shell-') && key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(event));
  } else {
    event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
  }
});

async function networkFirst(event) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(event.request);
    if (response.ok) event.waitUntil(cache.put(event.request, response.clone()));
    return response;
  } catch {
    return (await cache.match(event.request)) ?? (await cache.match('/')) ?? Response.error();
  }
}
