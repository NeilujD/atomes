# The server signs readers in as an OAuth confidential client

Status: accepted (2026-11-09). Supersedes ADR 0009.

ADR 0009 kept tokens out of the server because the server held no Library data. Since ADR 0012 the instance stores Private records, so that reason is gone, and the server must know which reader calls it. The server is now an AT Protocol OAuth **confidential client** (backend-for-frontend) with `@atproto/oauth-client-node`, the library's recommended design. It holds each reader's OAuth session and gives the browser its own session cookie. The browser calls only the Atomes server: the server stores Private records (ADR 0012) and writes Shared records to the reader's PDS for them.

## Consequences

- **Session cookie**: `HttpOnly`, `Secure`, `SameSite=Lax`. The browser never sees an OAuth token.
- **One secret per instance**: the confidential client's private key, given as a setting at run time. The image still holds no secret (ADR 0007); each instance has one. Tokens and DPoP keys are encrypted at rest in the instance's SQLite with a key given at run time.
- **Who may sign in**: an allow-list of DIDs per instance. Only the owner at first, then invited readers. Opening sign-up to anyone is a later decision, because it widens the data the instance holds (ADR 0012).
- **CSRF**: every request that writes checks that `Origin` is `PUBLIC_APP_ORIGIN`, on top of `SameSite=Lax`.
- **Security headers**: every response sends a Content-Security-Policy and the usual headers (no framing, no MIME sniffing, strict referrer). Any XSS can now act as the reader, so this is required, not optional.
- **Offline**: unchanged for the reader. The device copy and write queue work while offline or signed out (ADR 0002) and send when the server answers.
- **PDS outages**: Private writes no longer need the reader's PDS; only Shared writes wait for it.
- **CORS**: a PDS that refuses browser calls can now be used, because only the server calls it.
- **Handles** are resolved by the server, not through Bluesky, so Bluesky does not learn who signs in (as in ADR 0009).
- **Scopes**: `atproto repo?collection=app.atomes.readingStatus&collection=app.atomes.label&collection=app.atomes.follow`. It allows create, update and delete on the Shared record collections only, with no Space scope and no `blob:` scope. It needs no published lexicon. A session keeps the scopes of its sign-in, so a new Shared collection means each reader signs in again (spike `docs/spikes/0003-confidential-oauth-client.md`, section 3).
- **Session length** (verified 2026-11-09, spike 0003, section 1): the reference authorization server gives a confidential client a session of up to 2 years, with a refresh token that expires after 3 months without a refresh. A public client gets 2 weeks for both. The server must handle `invalid_grant` at any time, because the client cannot read these values.
- **Local development** (verified 2026-11-09, spike 0003, section 2): on `http://127.0.0.1:4321` the server is a loopback public client (no key, 2-week sessions). The confidential client needs a public `https://` origin, so it runs on the Funnel, staging and production. One `NodeOAuthClient` selects its metadata from `PUBLIC_APP_ORIGIN`, as the official statusphere example does.
- **Packages** (spike 0003, section 4): stable `@atproto/oauth-client-node` 0.5.16, `@atproto/lexicon` 0.7.19 and `@atproto/syntax` 0.7.7, with no `overrides`. The Space lexicon `lexicons/app/atomes/library.json` must leave the loaded lexicons, because the stable parser refuses `type: "space"`.

## Considered Options

- Keep the browser public client (ADR 0009) and send a service-auth JWT from the reader's PDS with every call: rejected. Every Private write would need the PDS to be up, sessions would stay at 2 weeks, and the project would own the JWT and DID checks.
- Let atproto prove the identity once, then issue the instance's own session: rejected. It keeps the CORS limit and the project would own the identity check and the sessions.
- Keep ADR 0009 unchanged: not possible, because the server would not know which reader calls it.
