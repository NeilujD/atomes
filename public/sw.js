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
  '/add',
  '/book',
  '/library',
  '/settings',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/favicon-32.png',
  '/apple-touch-icon-180.png',
  '/icons/atomes-icon-192.png',
  '/icons/atomes-icon-512.png',
  // Outside production, the pages use these (src/lib/environment.ts).
  '/favicon-staging.svg',
  '/favicon-staging-32.png',
  '/apple-touch-icon-staging-180.png',
  '/icons/atomes-icon-staging-192.png',
  '/icons/atomes-icon-staging-512.png',
];

// Catalog answers and covers (`/api/catalog/...`), network first: offline, a
// Book page still shows a book looked up before. Book data only, never Library
// data, but it tells which books were looked up: sign-out deletes this cache
// (src/lib/auth/device-data.ts). Its own cache, so a new worker keeps it.
// Nothing else under /api/ or /oauth/ is cached: the Library and the session
// stay on the device only in the local copy (src/lib/space/local-copy.ts).
const CATALOG_CACHE = 'atomes-catalog';

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
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  } else if (request.mode === 'navigate') {
    // Kept by path, never with its query (`/book?work=…`, `/add?isbn=…`): the
    // query names the reader's books, and the shell stays after sign-out. A
    // page is the same for every query; its script reads the query.
    event.respondWith(networkFirst(event, CACHE, '/', new URL(url.pathname, self.location.origin).href));
  } else if (url.pathname.startsWith('/api/catalog/')) {
    event.respondWith(networkFirst(event, CATALOG_CACHE));
  } else {
    event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
  }
});

// Keeps the last good response under `key`; offline, serves it, else the `fallback` path.
async function networkFirst(event, cacheName, fallback, key = event.request) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(event.request);
    if (response.ok) event.waitUntil(cache.put(key, response.clone()));
    return response;
  } catch {
    return (await cache.match(key)) ?? (fallback && (await cache.match(fallback))) ?? Response.error();
  }
}
