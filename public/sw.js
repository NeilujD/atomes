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
    event.respondWith(networkFirst(event, CACHE, '/'));
  } else {
    event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
  }
});

// Keeps the last good response; offline, serves it, else the `fallback` path.
async function networkFirst(event, cacheName, fallback) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(event.request);
    if (response.ok) event.waitUntil(cache.put(event.request, response.clone()));
    return response;
  } catch {
    return (await cache.match(event.request)) ?? (fallback && (await cache.match(fallback))) ?? Response.error();
  }
}
