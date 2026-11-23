// Health check for Docker HEALTHCHECK and the host (Coolify). 200 means the
// server answers requests and its data files are open, with every migration
// step run (start-up.ts); 503 means a file cannot open or a step failed.
import type { APIRoute } from 'astro';
import { errorLogText } from '../lib/server/accounts';
import { startUp } from '../lib/server/start-up';

const headers = { 'cache-control': 'no-store' };

export const GET: APIRoute = () => {
  try {
    startUp();
  } catch (error) {
    console.error(`Start-up failed: ${errorLogText(error)}`);
    return new Response('not ready', { status: 503, headers });
  }
  return new Response('ok', { headers });
};
