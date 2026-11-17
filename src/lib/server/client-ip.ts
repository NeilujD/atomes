// The address of the client, for the per-IP limits (Catalog lookups, Sign-in
// Codes). The instance runs behind one reverse proxy (ADR 0011: Traefik,
// Coolify's default), which adds the address it sees to the end of
// X-Forwarded-For. Only that last entry is trusted: the client can write any
// entries before it. With no proxy (local development), the address of the
// connection.
export function clientIp(request: Request, peer: string | undefined): string | undefined {
  const last = request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  return last || peer;
}
