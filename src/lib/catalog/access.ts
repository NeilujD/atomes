// Who may use the Catalog API, and how much (ADR 0010, "Catalog access").
// ISBN lookups are open to anyone, with a limit per IP address. A signed-in
// reader is not limited, and only a signed-in reader starts an Edition Line
// fill: a stranger who triggers many source calls gets the instance banned by
// the sources, not themselves.

// The address of the client. The instance runs behind one reverse proxy
// (ADR 0011: Traefik, Coolify's default), which adds the address it sees to the
// end of X-Forwarded-For. Only that last entry is trusted: the client can write
// any entries before it. With no proxy (local development), the address of the
// connection.
export function clientIp(request: Request, peer: string | undefined): string | undefined {
  const last = request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  return last || peer;
}

export interface IpLimit {
  // Counts one request of `ip`. Undefined when it is within the limit; else the
  // seconds to wait until the limit resets.
  take(ip: string): number | undefined;
}

// At most `max` requests per IP in each window of `windowMs`, counted from the
// first request of that IP. Kept in memory: a restart resets every limit.
export function createIpLimit({ max, windowMs, now = Date.now }: { max: number; windowMs: number; now?: () => number }): IpLimit {
  const windows = new Map<string, { start: number; count: number }>();
  let swept = now();
  return {
    take(ip) {
      const time = now();
      if (time - swept >= windowMs) {
        for (const [key, window] of windows) if (time - window.start >= windowMs) windows.delete(key);
        swept = time;
      }
      let window = windows.get(ip);
      if (!window || time - window.start >= windowMs) {
        window = { start: time, count: 0 };
        windows.set(ip, window);
      }
      window.count += 1;
      return window.count > max ? Math.max(1, Math.ceil((window.start + windowMs - time) / 1000)) : undefined;
    },
  };
}

export interface CatalogAccess {
  limit: IpLimit;
  signedIn: (request: Request) => boolean;
}

// `refused` (429) when a signed-out client is over its limit. Else whether the
// request may start a fill.
export function checkAccess(
  request: Request,
  peer: string | undefined,
  { limit, signedIn }: CatalogAccess,
): { refused: Response } | { signedIn: boolean } {
  if (signedIn(request)) return { signedIn: true };
  const wait = limit.take(clientIp(request, peer) ?? 'unknown');
  if (wait === undefined) return { signedIn: false };
  return {
    refused: Response.json(
      { error: 'TooManyRequests', message: 'Too many ISBN lookups from this address. Try again later, or sign in.' },
      { status: 429, headers: { 'retry-after': String(wait), 'cache-control': 'no-store' } },
    ),
  };
}
