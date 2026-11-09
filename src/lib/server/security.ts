// What protects the reader's session on every request (ADR 0013): the server
// holds that session, so a request from another site or an injected script
// could act as the reader.
//
// Pages get their Content-Security-Policy from Astro (`security.csp` in
// astro.config.mjs), with a hash for each inline script and style. Other
// answers (API, redirects) load nothing, so they get the strictest policy.

const apiPolicy = "default-src 'none'; frame-ancestors 'none'";
// Astro adds no CSP in `astro dev` (Vite needs inline scripts): pages there
// still cannot be framed.
const pageFallbackPolicy = "frame-ancestors 'none'";

// Not `no-referrer`: with it, the browser sends `Origin: null` on the app's
// own writes (Fetch standard, "append a request Origin header"), and
// `isSameOrigin` would refuse them.
const referrerPolicy = 'same-origin';

export async function guard(request: Request, next: () => Promise<Response>, appOrigin?: string): Promise<Response> {
  const writes = request.method !== 'GET' && request.method !== 'HEAD';
  const response =
    writes && !isSameOrigin(request, appOrigin)
      ? Response.json({ error: 'Forbidden', message: 'Cross-origin request refused' }, { status: 403 })
      : await next();
  return withSecurityHeaders(response);
}

// CSRF (ADR 0013), on top of SameSite=Lax. With no PUBLIC_APP_ORIGIN (local
// development), the origin the browser asked: the Host header, since the built
// server can put `localhost` in the request URL for any host.
export function isSameOrigin(request: Request, appOrigin?: string): boolean {
  const url = new URL(request.url);
  const own = appOrigin ?? `${url.protocol}//${request.headers.get('host') ?? url.host}`;
  return request.headers.get('origin') === own;
}

// Routes must answer with `new Response(...)`: `Response.redirect()` and
// fetched answers have read-only headers.
function withSecurityHeaders(response: Response): Response {
  const { headers } = response;
  if (!headers.has('content-security-policy')) {
    const html = headers.get('content-type')?.startsWith('text/html') ?? false;
    headers.set('content-security-policy', html ? pageFallbackPolicy : apiPolicy);
  }
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', referrerPolicy);
  return response;
}
