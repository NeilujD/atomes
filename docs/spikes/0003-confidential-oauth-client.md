# Spike: Confidential OAuth client on the server

Linear: CORE-45. Researched 2026-11-09. Web pages were opened on that date. Atproto code was read on `main` at [`7a46712`](https://github.com/bluesky-social/atproto/tree/7a467120982d9ff1559afeb3a26989dad5877d17) (2026-11-09). Versions come from `npm view` on that date. The checks in "Method" ran in a scratch folder outside the repo; no repo test calls a PDS.

## TL;DR

The server can be the confidential client that ADR 0013 describes, with stable packages. Local development uses the loopback client, which is a public client.

- **Session length**: a confidential client gets a session of up to **2 years**. A refresh token expires after **3 months** without a refresh, and each refresh starts the 3 months again. A public client gets **2 weeks** for both.
- **Local development**: on `http://127.0.0.1:4321` the server can only be a **loopback public client** (no key, 2-week sessions). The confidential client needs a public `https://` origin (the Funnel, staging, production). One `NodeOAuthClient` covers both: the official example selects the metadata from one setting.
- **Scope**: `atproto repo?collection=app.atomes.readingStatus&collection=app.atomes.label&collection=app.atomes.follow` (105 characters). It allows create, update and delete on these 3 collections only. It needs no published lexicon. `bsky.social` accepted it in a live PAR request.
- **Packages**: `@atproto/oauth-client-node` **0.5.16**, `@atproto/lexicon` 0.7.19, `@atproto/syntax` 0.7.7, `@atproto/oauth-client-browser` 0.5.14. Remove all `overrides`. One change is necessary: the stable lexicon parser refuses the Space lexicon `lexicons/app/atomes/library.json` (`type: "space"`). With that file out of the loaded set, 298 of 299 tests pass. The remaining failure is the test of that Space lexicon.

## 1. Session length

**Answer: a confidential client gets 2 years, with a refresh at least every 3 months. A public client gets 2 weeks.**

The spec gives limits, and the authorization server picks the values:

- Public client: "overall session lifetime and the lifetime of individual refresh tokens should both be limited to 2 weeks" ([OAuth spec](https://atproto.com/specs/oauth#:~:text=should%20both%20be%20limited%20to%202%20weeks)).
- Confidential client: "for confidential clients, the overall session lifetime may be unlimited" ([OAuth spec](https://atproto.com/specs/oauth#:~:text=for%20confidential%20clients%2C%20the%20overall%20session%20lifetime%20may%20be%20unlimited)), and "Individual refresh tokens should have a lifetime limited to 180 days" ([OAuth spec](https://atproto.com/specs/oauth#:~:text=Individual%20refresh%20tokens%20should%20have%20a%20lifetime%20limited%20to%20180%20days)).
- Access tokens: "access token lifetimes should be less than 30 minutes in all situations" ([OAuth spec](https://atproto.com/specs/oauth#:~:text=access%20token%20lifetimes%20should%20be%20less%20than%2030%20minutes%20in%20all%20situations)).

Values in the reference authorization server (`@atproto/oauth-provider`, used by the reference PDS):

| Value | Public client | Confidential client | Source |
|---|---|---|---|
| Session, from sign-in | 2 weeks (`SESSION_LIFETIME`) | **2 years** (`SESSION_LIFETIME_EXTENDED`) | [`oauth-constants.ts` L42–57](https://github.com/bluesky-social/atproto/blob/7a467120982d9ff1559afeb3a26989dad5877d17/packages/oauth/oauth-provider/src/oauth-constants.ts#L42-L57) |
| Refresh token, from the last refresh | 2 weeks (`REFRESH_LIFETIME`) | **3 months** (`REFRESH_LIFETIME_EXTENDED`) | same |
| Access token | 60 min (`TOKEN_MAX_AGE`), never after the session end | same | [`oauth-constants.ts` L36](https://github.com/bluesky-social/atproto/blob/7a467120982d9ff1559afeb3a26989dad5877d17/packages/oauth/oauth-provider/src/oauth-constants.ts#L36), [`token-manager.ts` L59](https://github.com/bluesky-social/atproto/blob/7a467120982d9ff1559afeb3a26989dad5877d17/packages/oauth/oauth-provider/src/token/token-manager.ts#L59) |

- A client is confidential when `token_endpoint_auth_method` is not `none`; then it gets the extended values ([`client.ts` L80–105](https://github.com/bluesky-social/atproto/blob/7a467120982d9ff1559afeb3a26989dad5877d17/packages/oauth/oauth-provider/src/client/client.ts#L80-L105)).
- The refresh check compares the session age with `sessionLifetime` and the time since the last refresh with `refreshLifetime` ([`oauth-provider.ts` L1058–1067](https://github.com/bluesky-social/atproto/blob/7a467120982d9ff1559afeb3a26989dad5877d17/packages/oauth/oauth-provider/src/oauth-provider.ts#L1058-L1067)). Each refresh sets `updatedAt: now` ([`token-manager.ts` L263](https://github.com/bluesky-social/atproto/blob/7a467120982d9ff1559afeb3a26989dad5877d17/packages/oauth/oauth-provider/src/token/token-manager.ts#L263)). So the 3 months slide, and the 2 years are a hard limit.
- The token response gives only `expires_in` for the access token ([`token-manager.ts` L225](https://github.com/bluesky-social/atproto/blob/7a467120982d9ff1559afeb3a26989dad5877d17/packages/oauth/oauth-provider/src/token/token-manager.ts#L225)). The client cannot read the refresh lifetime, so the app must handle `invalid_grant` ("Session expired", "Refresh token expired") at any time.
- These values have not changed since at least [`87e6a95`](https://github.com/bluesky-social/atproto/commit/87e6a95) (2026-07-27). `bsky.social` reports build `4169ebe` (`/xrpc/_health`). That commit is not public, so the values of the hosted server are inferred, not read.

What this means for Atomes: a reader who opens the app at least once every 3 months stays signed in for up to 2 years. The server must refresh the session when the reader uses it. A background refresh job is not necessary.

## 2. `@atproto/oauth-client-node` on `http://127.0.0.1:4321`

**Answer: in local development the server runs as a loopback public client. The confidential client works only on a public `https://` origin.**

- The spec: a `client_id` must be `https://` with no port, except `http://localhost` for development, and "this works as a public client, not a confidential client" ([OAuth spec](https://atproto.com/specs/oauth#:~:text=Note%20that%20this%20works%20as%20a%20public%20client%2C%20not%20a%20confidential%20client)). "IP addresses (127.0.0.1, etc) are not supported" in the `client_id` ([OAuth spec](https://atproto.com/specs/oauth#:~:text=IP%20addresses,are%20not%20supported)). The redirect URI uses `127.0.0.1`, and "port numbers are not matched" ([OAuth spec](https://atproto.com/specs/oauth#:~:text=port%20numbers%20are%20not%20matched)).
- The library: a `client_id` that starts with `http:` must be a loopback ID. `none` needs no key. `private_key_jwt` needs a key set with an ES256 key that has a `kid`, plus `jwks` or `jwks_uri` ([`validate-client-metadata.ts` L44–61](https://github.com/bluesky-social/atproto/blob/7a467120982d9ff1559afeb3a26989dad5877d17/packages/oauth/oauth-client/src/validate-client-metadata.ts#L44-L61)). This logic is the same in the alpha build in `node_modules` and on `main`.
- Confidential metadata on `http://127.0.0.1:4321` is refused at construction: "URL must use the "https:" protocol" and "ClientID hostname must not be an IP address" (checked, see Method).
- The README says that without a key set "sessions [will] have a shorter lifetime" ([README L200](https://github.com/bluesky-social/atproto/blob/7a467120982d9ff1559afeb3a26989dad5877d17/packages/oauth/oauth-client-node/README.md?plain=1#L200)). The README has no local-development section.
- The official example [statusphere-example-app `lib/auth/client.ts`](https://github.com/bluesky-social/statusphere-example-app/blob/dbb97738caa965c4b04efd281bfa1d2fbe4fffb3/lib/auth/client.ts#L21-L50) does exactly this: with `PUBLIC_URL`, `private_key_jwt` with ES256 and `jwks_uri`; without it, `buildAtprotoLoopbackClientMetadata({ scope, redirect_uris: ["http://127.0.0.1:3000/oauth/callback"] })` and no key set.

Design for Atomes (input for the sign-in ticket):

| | Local development | Funnel, staging, production |
|---|---|---|
| Setting | `PUBLIC_APP_ORIGIN` not set, app on `127.0.0.1` | `PUBLIC_APP_ORIGIN=https://…` and a private key setting (ES256 JWK) |
| Metadata | `buildAtprotoLoopbackClientMetadata` | `private_key_jwt`, `token_endpoint_auth_signing_alg: "ES256"`, `jwks_uri: ${origin}/oauth/jwks.json` |
| Endpoints | none | `/oauth/client-metadata.json` and `/oauth/jwks.json` (`client.jwks` holds only public keys; checked) |
| Session | 2 weeks (public) | 2 years / 3 months (confidential) |

- Stores: `stateStore` (sign-in in progress; delete after about 1 hour) and `sessionStore` (one entry per DID). Both can use the instance's SQLite. The README gives the shape ([README L217–261](https://github.com/bluesky-social/atproto/blob/7a467120982d9ff1559afeb3a26989dad5877d17/packages/oauth/oauth-client-node/README.md?plain=1#L217-L261)).
- `requestLock`: without it the library logs "No lock mechanism provided. Credentials might get revoked." The package exports `requestLocalLock`. It is enough for the one-process instance (ADR 0007). Two processes would need a shared lock, because two refreshes with the same token make the server revoke the session ([`token-manager.ts` `consumeRefreshToken`](https://github.com/bluesky-social/atproto/blob/7a467120982d9ff1559afeb3a26989dad5877d17/packages/oauth/oauth-provider/src/token/token-manager.ts)).
- The phone test keeps the Funnel origin (`docs/phone-https.md`). It now also needs the private key setting in `.env.local`.

## 3. Scopes for Shared records

**Answer: `atproto repo?collection=app.atomes.readingStatus&collection=app.atomes.label&collection=app.atomes.follow`.**

- `atproto` is required in every session ([OAuth spec](https://atproto.com/specs/oauth#:~:text=is%20required%20for%20all%20atproto%20OAuth%20sessions)). Do not use `transition:generic`: it allows writes to "any repository record type".
- `repo` takes repeated `collection` parameters ([permission spec](https://atproto.com/specs/permission#:~:text=repo%3Fcollection%3Dapp.example.profile%26collection%3Dapp.example.post)). Without `action`, "all operations are allowed" (create, update, delete) ([permission spec](https://atproto.com/specs/permission#:~:text=If%20not%20defined%2C%20all%20operations%20are%20allowed)). Atomes needs all three: sharing creates the public record, an edit updates it, and unsharing deletes it (ADR 0003).
- `putRecord` checks both `create` and `update` ([`putRecord.ts` L83–90](https://github.com/bluesky-social/atproto/blob/7a467120982d9ff1559afeb3a26989dad5877d17/packages/pds/src/api/com/atproto/repo/putRecord.ts#L83-L90)). `applyWrites` checks each action and collection pair. A scope with fewer actions would break `putRecord`.
- Public records can be read without a token, so the scope needs no read part.
- Collections: GLOSSARY says Copies, Loans and To Buy are never Shared. So `app.atomes.copy`, `app.atomes.toBuy` and the Space type `app.atomes.library` stay out. `readingStatus` is Shared by category (GLOSSARY). `label` and `follow` are in the scope because no document excludes them. Remove them if the owner decides that they are never Shared.
- `blob:` is not necessary: no Atomes lexicon has a blob field. A blob scope cannot go in a permission set, and adding it later means each reader signs in again.
- Permission set (`include:app.atomes.…`): not now. The PDS must resolve the published lexicon at each sign-in, and "if a permission set can not be resolved (and is not already in a local cache), the auth request will fail" ([permission spec](https://atproto.com/specs/permission#:~:text=if%20a%20permission%20set%20can%20not%20be%20resolved)). Raw `repo` scopes need no resolution: the server resolves only `include:` scopes ([`lexicon-manager.ts` L30](https://github.com/bluesky-social/atproto/blob/7a467120982d9ff1559afeb3a26989dad5877d17/packages/oauth/oauth-provider/src/lexicon/lexicon-manager.ts#L30)).
- A session keeps the scopes of its sign-in ([permission spec](https://atproto.com/specs/permission#:~:text=OAuth%20session%20are%20strictly%20limited%20to%20the%20auth%20scopes%20in%20the%20initial%20grant)). A new Shared collection later means each reader signs in again. This is unlike Space collections, which reached open sessions at the next refresh (spike 0002, section 6).

Checks (Method): the stable `@atproto/oauth-scopes` 0.5.14 (the checker the PDS uses) allows create, update and delete on the 3 collections. It refuses all three on `app.atomes.copy`, `app.atomes.toBuy` and `app.bsky.feed.post`, and refuses blobs. A loopback PAR request to `https://bsky.social` with this scope returned an authorize URL with a `request_uri`. `bsky.social` lists only `atproto` and `transition:*` in `scopes_supported`, but it accepted the granular scope.

## 4. Stable packages

**Answer: go to the `latest` releases below and remove the `overrides` block. One change is necessary: the Space lexicon.**

| Package | Now (alpha) | `latest` (2026-11-09) | Use |
|---|---|---|---|
| `@atproto/oauth-client-node` | — | **0.5.16** (Node ≥ 22) | New: server sign-in. Re-exports `JoseKey`, `Keyset`, `requestLocalLock`, `buildAtprotoLoopbackClientMetadata` |
| `@atproto/lexicon` | `0.0.0-spaces-alpha-20261029171913` | **0.7.19** | Record validation (`records.ts`) |
| `@atproto/syntax` | same | **0.7.7** | `isValidRecordKey` (tests) |
| `@atproto/oauth-client-browser` | same | **0.5.14** | Only until the sign-in moves to the server, then remove |
| `@atproto/oauth-client` | same (override) | 0.9.3 | Comes with `oauth-client-node` |
| `@atproto/oauth-scopes` | — | 0.5.14 | Not needed by the app |

- Newer alpha builds exist (`alpha` tag: `0.0.0-spaces-alpha-20261105160032`). They do not matter: ADR 0012 stops the Space calls.
- Changelogs since 0.5.11 / 0.8.9 / 0.7.14 contain patch releases only, plus `@atproto/oauth-client` 0.9.0, which moved the resolver into `@atproto/oauth-resolver` ([CHANGELOG](https://github.com/bluesky-social/atproto/blob/7a467120982d9ff1559afeb3a26989dad5877d17/packages/oauth/oauth-client/CHANGELOG.md)). No change to `NodeOAuthClient`, `authorize`, `callback` or `restore` is listed ([CHANGELOG](https://github.com/bluesky-social/atproto/blob/7a467120982d9ff1559afeb3a26989dad5877d17/packages/oauth/oauth-client-node/CHANGELOG.md)).

What changes in the code (checked in a scratch copy with the stable versions):

1. **Space lexicon**: the stable parser refuses `lexicons/app/atomes/library.json` ("Invalid type: space must be one of: record, query, …"). `records.ts` loads all lexicon files, so 9 test files fail. Fix: move `library.json` out of the folder that `records.ts` and `scripts/publish-lexicons.ts` load (for example to `lexicons-space/`, kept as the reference for the move, ADR 0003 amendment). Delete or move the test "the Library Space lists exactly the Library record types". Result: 298 of 299 tests pass; the remaining failure is that test. `bun run check` reports 2 errors, both in that test.
2. **`package.json`**: remove `overrides`. Exact pins are no longer needed; the lockfile fixes the versions.
3. **`client-config.ts`**: the scope becomes the `repo` scope of section 3. `src/lib/space/` stays unused (it imports no `@atproto` package).
4. **Browser client**: stable 0.5.14 type-checks and its tests pass with the current `browser-client.ts` and `session.ts`. The server sign-in removes it.

## Risks and open questions

| # | Item | Impact | Next step |
|---|---|---|---|
| 1 | Session values of hosted PDSes are read from code at `main`, not from the deployed build (`4169ebe` is not public) | A hosted PDS could give shorter sessions | Handle `invalid_grant` at any time; check the session age on the owner's account after the first weeks of use |
| 2 | Live checks used `bsky.social` without an account. No full sign-in and no write with the test account | Consent and write are not seen live | First check of the sign-in ticket: sign in with the test account over the Funnel, then `putRecord` one `app.atomes.readingStatus` |
| 3 | `label` and `follow` in the scope | If never Shared, the token allows more than needed | Owner decides. Removing them later needs no new sign-in, but old sessions keep the wider scope until they end. Adding them later needs a new sign-in |
| 4 | A new Shared collection needs a new sign-in for each reader | Readers sign in again after such a release | Put all collections that can be Shared in the first scope |
| 5 | The private key is the only instance secret (ADR 0013) | If it leaks, someone can act as the client. Old sessions stay bound to their DPoP keys | Key in a run-time setting. Rotate it with a second `kid` in the key set. Never put it in the image |
| 6 | Several processes would revoke sessions on concurrent refresh | Readers signed out | One process per instance (ADR 0007) with `requestLocalLock`. Use a shared lock if this changes |

## Method

- Spec text: [atproto.com/specs/oauth](https://atproto.com/specs/oauth) and [atproto.com/specs/permission](https://atproto.com/specs/permission), opened 2026-11-09.
- Code: `bluesky-social/atproto` at `7a46712`. The alpha build `0.0.0-spaces-alpha-20261029171913` was read in `node_modules`.
- Versions: `npm view <package> dist-tags`.
- Scratch checks (outside the repo, Node 24):
  - `@atproto/oauth-scopes` 0.5.14 `ScopePermissions.allowsRepo` / `allowsBlob` on the scope string.
  - `NodeOAuthClient` 0.5.16 built with confidential metadata and a new ES256 key: accepted on `https://`, refused on `http://127.0.0.1:4321`. `client.jwks` holds no private key.
  - Loopback `NodeOAuthClient.authorize("https://bsky.social", { scope })`: a live PAR request that returns an authorize URL. Nobody signed in.
  - `https://bsky.social/.well-known/oauth-authorization-server`: `token_endpoint_auth_methods_supported` is `none`, `private_key_jwt`. ES256 is supported.
  - Copy of the repo with the stable versions and no `overrides`: `bun run test` and `bun run check`, before and after moving `library.json`.
