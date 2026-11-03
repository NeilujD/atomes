# Spike: OAuth and Spaces alpha for a browser app

Linear: CORE-14. Researched 2026-11-03. Sources opened on that date; versions from `npm view` on that date.

## TL;DR

The browser can sign in as an OAuth public client and read and write the reader's Space on their PDS directly. The Atomes server never sees Library data, so ADR 0001 holds. The decision is in ADR 0009.

- Public-client sessions last at most **2 weeks** (spec guidance). The reader signs in again after that.
- Private Library goes into a **`com.atproto.personalspace`** Space. `com.atproto.simplespace` no longer exists (removed 2026-10-29).
- All `@atproto/*` packages under the `alpha` tag: **`0.0.0-spaces-alpha-20261029171913`**. They contain no Node-only imports.
- Phone test: **Tailscale Funnel on port 443** (free, stable `*.ts.net` HTTPS hostname).

## 1. Browser OAuth as a public client

**Answer: yes.** Nothing changes in the sign-in, Space or offline issues, except the constraints below.

- The spec allows browser apps as public clients. A backend-for-frontend (BFF) is optional: "Mobile apps and browser apps can also adopt a "backend-for-frontend" (BFF) architecture" ([OAuth spec](https://atproto.com/specs/oauth#:~:text=backend-for-frontend)).
- Authorization servers must accept browser calls: "Authorization Servers must support HTTP CORS requests/headers on relevant endpoints" ([OAuth spec](https://atproto.com/specs/oauth#:~:text=Authorization%20Servers%20must%20support%20HTTP%20CORS)).
- Library: [`@atproto/oauth-client-browser`](https://github.com/bluesky-social/atproto/blob/main/packages/oauth/oauth-client-browser/README.md) is "designed for front-end applications that do not have a backend server". It keeps the DPoP key and session in IndexedDB and uses WebCrypto only.
- The reference PDS adds the `cors` middleware before every XRPC route, the `com.atproto.space.*` routes included (`packages/pds/src/index.ts`, `permissioned-data` branch at `d009736`). Read in code, not tested live.

Constraints:

| # | Constraint | Source | Effect on Atomes |
|---|---|---|---|
| 1 | Session and refresh token of a public client "should both be limited to 2 weeks"; access token < 30 min | [OAuth spec](https://atproto.com/specs/oauth#:~:text=should%20both%20be%20limited%20to%202%20weeks) | Reader signs in again every ≤ 2 weeks. Offline mode must work with an expired session and sync when the reader signs in again. |
| 2 | The browser cannot resolve handles over DNS; a resolver service is needed. Using Bluesky's "will leak both user IP addresses and handle identifiers to Bluesky" | [README](https://github.com/bluesky-social/atproto/blob/main/packages/oauth/oauth-client-browser/README.md) | Use `AtprotoDohHandleResolver` with a DoH endpoint. No Library data is sent. |
| 3 | PDS CORS: "CORS support is encouraged but not required" | [XRPC spec](https://atproto.com/specs/xrpc#:~:text=CORS%20support%20is%20encouraged%20but%20not%20required) | A third-party PDS can block the app. Show a clear error. The reference PDS allows it. |
| 4 | Sign-in uses a full-page redirect | README | Sign-in runs in a window, never in the service worker. |
| 5 | The README recommends a BFF because it gets longer tokens | README | Rejected: a BFF puts tokens and Library traffic on the Atomes server (ADR 0001). |

## 2. Local development: the loopback client

**Confirmed, with one correction to the search excerpts:** the `client_id` uses `localhost`, but the app itself must run on `127.0.0.1`.

- `client_id` is `http://localhost` exactly: "the hostname is exactly `localhost` with no port specified. IP addresses (`127.0.0.1`, etc) are not supported. The path parameter must be empty" ([OAuth spec, Localhost Client Development](https://atproto.com/specs/oauth#:~:text=hostname%20is%20exactly)).
- Query parameters: `redirect_uri` (repeatable; path is matched, port is ignored; default `http://127.0.0.1/` and `http://[::1]/`) and `scope` (one parameter; default `atproto`).
- The server uses virtual metadata: `token_endpoint_auth_method: none`, `application_type: native`, `dpop_bound_access_tokens: true`. It is a public client only.
- The app origin must be `http://127.0.0.1:<port>` or `http://[::1]:<port>`, "and **not** `http://localhost:<port>`" (README). The library sends `localhost` visitors to `127.0.0.1`. Run Astro with `--host 127.0.0.1` and open that address.
- Example: `http://localhost?redirect_uri=http%3A%2F%2F127.0.0.1%3A4321%2Foauth%2Fcallback&scope=atproto%20space%3Aapp.atomes.library%3Fskey%3Dself%26manage%3Dcreate`.
- Limits (README): refresh tokens "very limited (typically 1 day)", no silent sign-in, no app name or logo on the consent screen.
- Support is optional for authorization servers ("encouraged … but it is optional"). Check it against the alpha PDS in the sign-in ticket.
- [Discussion #5255](https://github.com/bluesky-social/atproto/discussions/5255) proposes to allow `localhost` redirect URIs. It is a proposal only (last activity 2026-08-19). One comment reports that the reference PDS caches scopes and DIDs for about 30 minutes, so a change to scopes or metadata can take that long to show.

## 3. Phone test over HTTPS

**Recommendation: Tailscale Funnel on port 443.** The loopback client cannot work from a phone, because `127.0.0.1` is the phone itself.

Rules that drive the choice ([OAuth spec](https://atproto.com/specs/oauth#:~:text=on%20the%20public%20web)): `client_id` must be an `https://` URL with no port; the authorization server fetches the metadata from the public web (HTTP 200, no redirect, `application/json`); `redirect_uris` must match. A stable hostname means we write the metadata once.

| Option | Hostname | Needs | Live dev server | Verdict |
|---|---|---|---|---|
| Tailscale Funnel | Stable `<machine>.<tailnet>.ts.net` | Tailscale account, all plans ([docs](https://tailscale.com/docs/features/tailscale-funnel)); ports 443/8443/10000 only | Yes | **Use** (port 443) |
| Cloudflare quick tunnel | Random: "The hostname changes each time you create a Quick Tunnel" ([docs](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/#:~:text=The%20hostname%20changes%20each%20time%20you%20create%20a%20Quick%20Tunnel.)) | Nothing | Yes | Reject: new `client_id` each run |
| Cloudflare named tunnel | Stable, own subdomain | A domain on Cloudflare | Yes | Fallback if the domain is on Cloudflare |
| Static preview (Pages, Netlify) | Stable branch alias | Host account | No (build per push) | Use for a last check of the built PWA |

How to publish the client metadata:

- One setting, `PUBLIC_APP_ORIGIN` (for example `https://mymac.tail1234.ts.net`).
- An Astro endpoint `src/pages/oauth/client-metadata.json.ts` builds the JSON from that setting. `client_id` = `${PUBLIC_APP_ORIGIN}/oauth/client-metadata.json`. The same function gives the object to `BrowserOAuthClient`, so the two cannot drift.
- Fields: `client_id`, `client_name`, `application_type: "web"`, `redirect_uris: ["${origin}/oauth/callback"]`, `scope`, `grant_types: ["authorization_code", "refresh_token"]`, `response_types: ["code"]`, `token_endpoint_auth_method: "none"`, `dpop_bound_access_tokens: true`.
- Do not take the origin from the request `Host` header.
- Add the exact hostname to Astro [`server.allowedHosts`](https://docs.astro.build/en/reference/configuration-reference/#serverallowedhosts) (Astro ≥ 5.4). Do not use `true`.
- Command: `tailscale funnel 4321`. Public DNS can take up to 10 minutes the first time.
- Keep the phone on one origin from sign-in to callback: the DPoP key, PKCE verifier and state are in origin-scoped storage.

## 4. Spaces

**Space type: `com.atproto.personalspace.policy`** with our own space-type lexicon, for example `app.atomes.library`.

Sources: [Spaces alpha post](https://atproto.com/blog/atproto-spaces-alpha), [proposal 0016](https://github.com/bluesky-social/proposals/blob/main/0016-permissioned-data/README.md) (the only spec), lexicons in `bluesky-social/atproto` branch `permissioned-data` at `d009736`, [bulletin](https://github.com/bluesky-social/bulletin) at `4c599c2`.

Policies (since the 2026-10-29 release):

| Policy | Meaning | Fit |
|---|---|---|
| `com.atproto.personalspace.policy` | "data that only its owner should see, such as bookmarks, mutes, or drafts". No configuration fields. | **One-member private Space** |
| `com.atproto.memberspace.policy` | The PDS keeps a member list; options `publicRead`, `publicWrite`, `allowedApps` | Later, for shared Spaces |
| `com.atproto.managedspace.policy` | An external app decides each access (`checkUserAccess`). Bulletin uses it. | No |

`com.atproto.simplespace` was in use until 2026-10-22. The 2026-10-29 release replaced it and migrated old spaces.

Calls (all `com.atproto.space.*`):

| Operation | Method | Inputs |
|---|---|---|
| Create the Space (once) | `createSpace` | `spaceType: "app.atomes.library"`, `skey: "self"`, `policy: { $type: "com.atproto.personalspace.policy" }` |
| Write | `putRecord` / `createRecord` | `space`, `repo` (reader DID), `collection`, `rkey`, `record` |
| Read one | `getRecord` | `space`, `repo`, `collection`, `rkey` |
| Read many | `listRecords` | `space`, `repo`, `collection`, `limit` (≤ 1000), `cursor` |
| Delete | `deleteRecord` | `space`, `repo`, `collection`, `rkey` |
| Sync (offline) | `listRepoOps`, `getLatestCommit` | For incremental sync of the device copy |

- Space reference: `at://<did>/space/<spaceType>/<skey>`.
- OAuth scope: `atproto space:app.atomes.library?skey=self&manage=create`. Default actions are read, create, update, delete on the collections that the space-type lexicon declares. `manage=create` is needed to create the Space.
- The reader's own reads and writes need only the OAuth token. Space credentials and `@atproto/space` are for other apps and syncers, not for us.
- Client calls: `new Client(session).call(...)` from `@atproto/lex-client` (as bulletin does in `lib/atproto/actions.ts`). Not compiled with the browser `OAuthSession` yet.
- Bulletin does sign-in, writes and sync on its Next.js server (`@atproto/oauth-client-node`, SQLite). Use it only as an example of call shapes, not of data flow.

Packages (`npm view <pkg> dist-tags`, 2026-11-03):

| Package | `alpha` | `latest` |
|---|---|---|
| `@atproto/oauth-client-browser` | `0.0.0-spaces-alpha-20261029171913` | 0.5.11 |
| `@atproto/oauth-client` | same | 0.9.0 |
| `@atproto/lex-client` | same | 0.4.0 |
| `@atproto/oauth-scopes` | same | 0.5.14 |
| `@atproto/api` | same | 0.30.0 |
| `@atproto/space` | same | 0.0.0-spaces-alpha-20260818022935 |

Browser fit: the alpha tarballs of `oauth-client-browser`, `oauth-client`, `lex-client`, `lex-data`, `lex-schema`, `api`, `xrpc`, `syntax` and `space` import no `node:*`, `fs`, `path` or `net` module. `oauth-client` uses `globalThis.crypto.subtle`. Not yet bundled by Astro.

## 5. The Thursday alpha PDS updates

- "We plan to update the hosted PDS and SDKs on Thursdays" ([post](https://atproto.com/blog/atproto-spaces-alpha#:~:text=We%20plan%20to%20update%20the%20hosted%20PDS%20and%20SDKs%20on%20Thursdays)). Each release updates the hosted PDS, the Docker image `ghcr.io/bluesky-social/atproto:pds-spaces-alpha` and the npm snapshots.
- Changelog: [Atmosphere forum thread 1129](https://discourse.atmosphere.community/t/atproto-spaces-alpha-updates/1129). Releases on 2026-09-10, 10-01, 10-22 and 10-29 had breaking changes; 10-15 did not.
- No wipe so far; schema changes were migrated in place. A wipe is still allowed: "we may even delete everything without warning", "We are not running backups", and the alpha PDS is deleted after the alpha.
- 10-29 is meant to be the last breaking alpha release; beta is planned for the end of November 2026.
- Open issues: label [`spaces alpha`](https://github.com/bluesky-social/atproto/issues?q=state%3Aopen%20label%3A%22spaces%20alpha%22), for example [#5736](https://github.com/bluesky-social/atproto/issues/5736) (no `swapRecord`).

What this means for us:

- Pin every `@atproto/*` package to the same exact snapshot, without `^`. Update them together after each Thursday post.
- Keep all Space calls in one module (`src/lib/space/`). The rest of the app uses Library types, not wire types.
- Check `describeServer` for `spacesAlpha: true` and show a clear error if it is missing.
- Keep an idempotent seed script for test data. The device copy and the seed script are what survive a wipe.
- Test data only on the alpha PDS (ADR 0003).

## Risks and open questions

| # | Item | Impact | Next step |
|---|---|---|---|
| 1 | At sign-in the PDS must resolve our space-type lexicon; if it cannot, it returns `invalid_scope` (`getSpacesFromScope` in `@atproto/oauth-provider@alpha`) | Sign-in with the Space scope fails | Owner: publish `app.atomes.*` lexicons (`_lexicon.atomes.app` DNS TXT record) before the Space ticket |
| 2 | Space data is not encrypted: "access control, not confidentiality" (proposal 0016) | The PDS operator can read the Library. Same as ADR 0003, which rejected encryption | Recorded in ADR 0003 |
| 3 | Can the space-type lexicon list `community.lexicon.book.status` as a collection (ADR 0004)? | Reading Status may need an `app.atomes.*` type inside the Space | Test in the Space ticket |
| 4 | Alpha PDS hostname not public; it is on the owner's account page | Blocks configuration | Owner: read it at https://bsky.network/account |
| 5 | Not tested live: CORS preflight on a Spaces PDS, loopback support on the alpha authorization server, `lex-client` with the browser session | All inferred from code and docs | First check of the sign-in and Space tickets |
| 6 | Reference PDS may cache scopes and metadata for about 30 minutes (#5255 comment, not checked in code) | Scope changes look broken for a while | Wait or use a new `client_id` path |
