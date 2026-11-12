// The screen a visitor asked for before the sign-in screen, and where the
// sign-in sends them back (ADR 0013, amendment 2026-11-12). Shared by the
// browser (the gate, the sign-in screen) and the server (the OAuth callback).

export const signInPath = '/sign-in';

const base = 'http://atomes.invalid';

// Path, query and hash of a screen of this app; Home for anything else, so the
// sign-in never sends the reader to another site.
export function returnTarget(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/')) return '/';
  const url = new URL(value, base);
  // `/.//evil.test` parses on this origin, but its path `//evil.test` names another site.
  if (url.origin !== base || url.pathname.startsWith('//')) return '/';
  if (url.pathname === signInPath || url.pathname.startsWith('/oauth/') || url.pathname.startsWith('/api/')) return '/';
  return url.pathname + url.search + url.hash;
}

// The sign-in screen, with the screen asked as its return target.
export function signInHref(asked: string): string {
  const next = returnTarget(asked);
  return next === '/' ? signInPath : `${signInPath}?next=${encodeURIComponent(next)}`;
}
