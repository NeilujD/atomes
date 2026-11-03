# One Docker image: Astro in server mode on Node, Catalog on SQLite

Status: accepted

The app runs as Astro in server mode with the Node adapter (`@astrojs/node`) and ships as one Docker image that also contains the Catalog. The Catalog stores its data in SQLite, in a file on a mounted volume; we move to Postgres only if SQLite becomes too small. Supabase is not used. Self-hosters run the same image as the project, so there is one way to deploy and one thing to test.

## Consequences

- The offline-first PWA of ADR 0002 still applies: the server renders pages and serves the Catalog, and the device keeps the local copy of the reader's Library.
- The server holds no Library data (ADR 0001), so SQLite only stores Catalog data. A backup is one file.

## Considered Options

- Supabase: rejected, because it adds a hosted dependency that self-hosters must also run, and the app has no user table to put in it.
- Static Astro site plus a separate API service: rejected, because it means two things to build, deploy and keep in step.
- Postgres from the start: rejected for now, because it adds a second container and the Catalog does not need it yet.
