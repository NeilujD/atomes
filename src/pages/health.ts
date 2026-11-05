// Liveness check for Docker HEALTHCHECK and the host (Coolify): 200 means the
// server answers requests.
import type { APIRoute } from 'astro';

export const GET: APIRoute = () => new Response('ok', { headers: { 'cache-control': 'no-store' } });
