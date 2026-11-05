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
  '/settings',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/favicon-32.png',
  '/apple-touch-icon-180.png',
  '/icons/atomes-icon-192.png',
  '/icons/atomes-icon-512.png',
];

// The OAuth metadata that the offline session restore (`init(false)`) reads,
// network first like pages. Without it, an offline reload shows "Could not open
// your session." and the library removes the session pointer on this device:
// - `/oauth/client-metadata.json`: the app fetches it on an HTTPS origin,
//   before the restore (src/lib/auth/client-metadata.ts). Not in SHELL: an instance without
//   PUBLIC_APP_ORIGIN answers 404, and `cache.addAll` then fails the install.
// - `/.well-known/oauth-authorization-server` on the authorization server: the
//   restore reads it on every host. The library keeps its copy 60 s only.
// Its own cache, with no version: a new worker must not delete it.
const OAUTH_CACHE = 'atomes-oauth';

// Catalog answers and covers (`/api/catalog/...`), network first: offline, a
// Book page still shows a book looked up before. Book data only, never Library
// data (ADR 0001), but it tells which books were looked up: sign-out deletes
// this cache and OAUTH_CACHE (src/lib/auth/device-data.ts). Its own cache, so a
// new worker keeps it.
const CATALOG_CACHE = 'atomes-catalog';

function isOAuthMetadata(url) {
  return url.origin === self.location.origin
    ? url.pathname === '/oauth/client-metadata.json'
    : url.pathname === '/.well-known/oauth-authorization-server';
}

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

  if (isOAuthMetadata(url)) {
    event.respondWith(networkFirst(event, OAUTH_CACHE));
  } else if (url.origin !== self.location.origin) {
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
