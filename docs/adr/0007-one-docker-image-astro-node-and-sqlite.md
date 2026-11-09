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

## Amendment 2026-11-09: a second file for reader records

The server now holds Private reader records (ADR 0012), so "SQLite only stores Catalog data" no longer holds. They go in a second file, `${DATA_DIR}/library.sqlite`, separate from `catalog.sqlite`. The Catalog file is a cache that the sources can rebuild; the Library file cannot be replaced. Separate files keep a Catalog bug away from reader records and allow a stricter backup rule for the Library (ADR 0011 amendment). Both use `node:sqlite`, built into Node.

- Turso (hosted Turso Cloud, a self-hosted libSQL server, or the Turso engine): rejected. The hosted service is a dependency that self-hosters must also use and a third party that holds reader data; the libSQL server is a second container; the engine replaces a module built into Node with a newer dependency, for a write load of a few readers. Look again if the device sync of ADR 0012 becomes a real burden and Turso's sync is stable, or if the project runs instances that must replicate across hosts.
