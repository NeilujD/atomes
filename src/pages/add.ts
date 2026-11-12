// Quick Add is part of Check a book (CORE-65): old links and bookmarks to
// `/add` open it, with their ISBN.
import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ url }) => new Response(null, { status: 301, headers: { location: `/check${url.search}` } });
