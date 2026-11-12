// The web manifest, per environment: staging, previews and local dev install
// with their own name and icons. Read at request time, so one built image
// serves any environment. The service worker precaches it (public/sw.js).
import type { APIRoute } from 'astro';
import { webManifest } from '../lib/environment';
import { appEnvironment } from '../lib/server/settings';

export const GET: APIRoute = () =>
  new Response(JSON.stringify(webManifest(appEnvironment(process.env))), {
    headers: { 'content-type': 'application/manifest+json', 'cache-control': 'no-cache' },
  });
