// Search is the Search mode of Check a book (CORE-190): old links and
// bookmarks to `/search` open it, with their words.
import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ url }) => {
  const query = new URLSearchParams([['mode', 'search'], ...[...url.searchParams].filter(([name]) => name !== 'mode')]);
  return new Response(null, { status: 301, headers: { location: `/check?${query}` } });
};
