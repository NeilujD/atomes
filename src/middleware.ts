// Runs before every route.
import { defineMiddleware } from 'astro:middleware';
import { guard } from './lib/server/security';
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

  // Writes from other sites are refused; every answer gets the security headers.
  return guard(request, next, settings().appOrigin);
});
