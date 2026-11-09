// Runs before every route.
import { defineMiddleware } from 'astro:middleware';
import { isSameOrigin } from './lib/server/auth';
import { settings } from './lib/server/settings';

export const onRequest = defineMiddleware((context, next) => {
  const { request, url } = context;

  // Local development: the loopback OAuth client needs the app on 127.0.0.1,
  // never on `localhost` (spike 0001): the same page there. Read from the Host
  // header: the built server can give `localhost` in `url` for any host.
  const host = request.headers.get('host') ?? '';
  if (import.meta.env.DEV && /^localhost(:|$)/.test(host) && (request.method === 'GET' || request.method === 'HEAD')) {
    const moved = new URL(url.pathname + url.search, `http://${host.replace(/^localhost/, '127.0.0.1')}`);
    return context.redirect(moved.href, 307);
  }

  // CSRF (ADR 0013): every request that writes comes from the app's own pages.
  if (request.method !== 'GET' && request.method !== 'HEAD' && !isSameOrigin(request, settings().appOrigin)) {
    return Response.json({ error: 'Forbidden', message: 'Cross-origin request refused' }, { status: 403 });
  }
  return next();
});
