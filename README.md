<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/icons/atomes-icon-dark.svg">
    <img src="public/icons/atomes-icon.svg" alt="Atomes logo: three book spines, one missing" width="128">
  </picture>
</p>

# Atomes

A personal library tracker built on AT Protocol: what you own, what you have read, and which series have new volumes.

Start here: [docs/HANDOFF.md](docs/HANDOFF.md). Vocabulary: [GLOSSARY.md](GLOSSARY.md). Decisions: [docs/adr/](docs/adr/).

Licence: [AGPL-3.0](LICENSE). Lexicon definitions (`app.atomes.*`) are MIT, so any app can adopt them ([ADR 0006](docs/adr/0006-agpl-for-app-and-catalog-mit-for-lexicons.md)).

## Develop

Needs Node 22.23.4+ and [Bun](https://bun.sh).

```sh
bun install
bun run check   # type check
bun run test    # tests (not `bun test`)
bun run build   # Node server in dist/
bun run dev     # http://127.0.0.1:4321
bun run phone   # built app for a phone test over HTTPS
```

Test on a phone: [docs/phone-https.md](docs/phone-https.md).

### Sign in during development

The server signs readers in and keeps their Private records ([ADR 0012](docs/adr/0012-private-records-on-the-instance-until-spaces.md), [ADR 0013](docs/adr/0013-server-side-oauth-client-and-web-surface.md)). On `http://127.0.0.1:4321` it is a loopback OAuth client: no key, sessions of 2 weeks. It does not answer until two settings are set. Put them in `.env.local` at the repo root (Git ignores it; `bun run dev` reads it):

```sh
ALLOWED_DIDS=did:plc:<your account>     # who may sign in, separated by commas
SESSION_ENCRYPTION_KEY=<openssl rand -base64 32>
```

- Find your DID: `curl -s 'https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=<handle>'`.
- Do not set `PUBLIC_APP_ORIGIN` in `.env.local`: with it, the server is the confidential client of that origin and sign-in on `127.0.0.1` fails.
- Open `http://127.0.0.1:4321/settings`, not `localhost` (the server moves `localhost` pages to `127.0.0.1`). Sign in, add a book, reload: the book is there, read from `data/library.sqlite`.
- Check the settings without the server: `node --env-file=.env.local scripts/check-settings.ts`.

## Run with Docker

One image runs the whole server ([ADR 0007](docs/adr/0007-one-docker-image-astro-node-and-sqlite.md)). The project's instances and self-hosters use the same image.

```sh
docker build -t atomes .
docker run -d --name atomes -p 4321:4321 -v atomes-data:/data \
  -e PUBLIC_APP_ORIGIN=https://atomes.example.org \
  -e ALLOWED_DIDS=did:plc:… \
  -e SESSION_ENCRYPTION_KEY=… \
  -e OAUTH_PRIVATE_KEY='{"kty":"EC",…}' atomes
```

The container stops at start, with a message that names each problem, when a required setting is missing or wrong. How to make the two keys: [docs/staging-coolify.md](docs/staging-coolify.md), step 8.

Put an HTTPS reverse proxy in front of it (Coolify, Caddy, Traefik): sign-in needs the app on its https origin. The project's own staging runs on Coolify ([ADR 0011](docs/adr/0011-project-instances-run-on-self-hosted-coolify.md)): [docs/staging-coolify.md](docs/staging-coolify.md).

| Setting | Default | What it does |
| --- | --- | --- |
| `PUBLIC_APP_ORIGIN` | not set | The https origin readers open, for example `https://atomes.example.org`. Without it, the server is a loopback client for `http://127.0.0.1` (development only). |
| `ALLOWED_DIDS` | required | The DIDs that may sign in, separated by commas. Others see a clear message and the instance keeps nothing for them. |
| `SESSION_ENCRYPTION_KEY` | required | 32 random bytes in base64. Encrypts OAuth tokens and DPoP keys in `auth.sqlite`. A new key signs every reader out. |
| `OAUTH_PRIVATE_KEY` | required with `PUBLIC_APP_ORIGIN` | The confidential client's ES256 private key, a JWK with a `kid`, as one line of JSON. Its public part is served at `/oauth/jwks.json`. |
| `PORT` | `4321` | Port the server listens on inside the container. |
| `HOST` | `0.0.0.0` | Address the server listens on. |
| `DATA_DIR` | `/data` | Folder for all saved state: `catalog.sqlite`, `library.sqlite` (readers' Private records) and `auth.sqlite` (sign-in sessions). Mount a persistent volume here. |

- Health check: `GET /health` answers `200`. The image has a Docker `HEALTHCHECK` that calls it with `wget`.
- The server runs as user `node` (uid 1000). A named volume works as is; a host folder must be writable by uid 1000.
- The image holds no secrets: give every setting at run time.
