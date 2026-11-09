# The browser signs in as an OAuth public client and calls the PDS directly

Status: superseded by ADR 0013 (2026-11-09), because the instance now stores Private records (ADR 0012)

The reader signs in from the browser with `@atproto/oauth-client-browser`, as an AT Protocol OAuth public client. The browser holds the session and DPoP key in IndexedDB and reads and writes the reader's PDS and Space directly. The Atomes server serves pages, the client metadata and the Catalog, but never holds OAuth tokens and never relays Library data (ADR 0001). The spec allows this, the reference PDS accepts browser calls, and the alpha Space packages contain no Node-only code (see `docs/spikes/0001-oauth-and-spaces-alpha.md`).

## Consequences

- Sessions of a public client last at most about 2 weeks, so the reader signs in again from time to time. The device copy of the Library stays usable while signed out (ADR 0002) and syncs after the next sign-in.
- Handles are resolved through a DNS-over-HTTPS resolver, not through Bluesky, so Bluesky does not learn who signs in.
- The client metadata is served at `/oauth/client-metadata.json`, built from one `PUBLIC_APP_ORIGIN` setting. Each self-hosted instance is its own OAuth client.
- Local development uses the loopback client (`client_id` `http://localhost`, app on `http://127.0.0.1`). Phone tests use a Tailscale Funnel HTTPS hostname.
- A PDS that refuses browser (CORS) calls cannot be used with Atomes.

## Considered Options

- Backend-for-frontend with `@atproto/oauth-client-node` (bulletin's design, and the library's recommendation): rejected. It gives longer sessions, but the server would hold tokens and relay Library data, which breaks ADR 0001.
- Token-mediating backend (server holds a confidential client key, browser holds the tokens): rejected for now. It adds a server secret and a server role in every sign-in for longer sessions only; reconsider if 2-week sessions are a real problem.
