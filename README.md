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

The server signs readers in and keeps their Private records ([ADR 0012](docs/adr/0012-private-records-on-the-instance-until-spaces.md), [ADR 0013](docs/adr/0013-server-side-oauth-client-and-web-surface.md)). On `http://127.0.0.1:4321` it is a loopback OAuth client: no key, sessions of 2 weeks. It does not answer until `SESSION_ENCRYPTION_KEY` is set. Put it in `.env.local` at the repo root (Git ignores it; `bun run dev` reads it):

```sh
SESSION_ENCRYPTION_KEY=<openssl rand -base64 32>
```

- A new Account needs an Invite ([ADR 0016](docs/adr/0016-atomes-account-atproto-account-optional.md)). With the dev server running, `bun scripts/invite.ts` prints an Invite link: open it, then sign in. A reader who has an Account signs in with no Invite.
- Sign in with an email address: the dev server sends no mail. Type the address, then open `http://127.0.0.1:4321/dev/outbox?to=<address>` and copy the Sign-in Code of the last mail (404 when no mail went to that address, and in a built server).
- Do not set `PUBLIC_APP_ORIGIN` in `.env.local`: with it, the server is the confidential client of that origin and sign-in on `127.0.0.1` fails.
- Open `http://127.0.0.1:4321/`, not `localhost` (the server moves `localhost` pages to `127.0.0.1`). The app sends you to the sign-in screen. Sign in, add a book, reload: the book is there, read from `data/library.sqlite`.
- Check the settings without the server: `NODE_ENV=development node --env-file=.env.local scripts/check-settings.ts`. Without `NODE_ENV=development` it checks them as a built server, which needs `SMTP_URL` and `MAIL_FROM`.

## Run with Docker

One image runs the whole server ([ADR 0007](docs/adr/0007-one-docker-image-astro-node-and-sqlite.md)). The project's instances and self-hosters use the same image.

```sh
docker build -t atomes .
docker run -d --name atomes -p 4321:4321 -v atomes-data:/data \
  -e PUBLIC_APP_ORIGIN=https://atomes.example.org \
  -e SESSION_ENCRYPTION_KEY=… \
  -e OAUTH_PRIVATE_KEY='{"kty":"EC",…}' \
  -e SMTP_URL='smtps://user:password@smtp.example.org:465' \
  -e MAIL_FROM='Atomes <atomes@example.org>' atomes
```

The container stops at start, with a message that names each problem, when a required setting is missing or wrong. How to make the two keys: [docs/staging-coolify.md](docs/staging-coolify.md), step 8. Then make an Invite for each reader: `docker exec atomes node scripts/invite.ts` prints a link that works once and for 14 days.

Put an HTTPS reverse proxy in front of it (Coolify, Caddy, Traefik): sign-in needs the app on its https origin. The project's own staging runs on Coolify ([ADR 0011](docs/adr/0011-project-instances-run-on-self-hosted-coolify.md)): [docs/staging-coolify.md](docs/staging-coolify.md).

| Setting | Default | What it does |
| --- | --- | --- |
| `PUBLIC_APP_ORIGIN` | not set | The https origin readers open, for example `https://atomes.example.org`. Without it, the server is a loopback client for `http://127.0.0.1` (development only). On a Coolify pull request preview (`COOLIFY_BRANCH=pull/<n>/head`), the preview URL that Coolify gives replaces it. |
| `SIGN_UP` | `invite` | Who may make an Account. `invite`: only with an Invite (`node scripts/invite.ts`); a reader who has an Account signs in with no Invite, others see "You need an Invite" and the instance keeps nothing for them. `open` is not built yet: the server refuses to start with it. |
| `PREVIEW_ACCOUNT_EMAIL` | not set | On a Coolify pull request preview only: one email address. At start, the server makes an Account with it if none has it, so the owner signs in there with a Sign-in Code and no Invite. Staging and production ignore it, but a preview gets the staging variables: set it on staging. |
| `LANDING_PAGE` | `on` | `on`: a visitor with no session who opens the instance sees the Landing page at `/welcome` (what Atomes is, the AT Protocol, self-hosting, credits). `off`: `/welcome` answers 404 and the instance opens on sign-in. A reader with a saved Account always opens Home. Any other value stops the start. |
| `LEGAL_PUBLISHER`, `LEGAL_CONTACT`, `LEGAL_HOST` | not set | The Legal notice at `/legal`, which French law asks of a public site: who publishes the instance (a name), how to reach them (an email address), and the host's company name, postal address and phone. `LEGAL_PUBLISHER` and `LEGAL_CONTACT` also name the operator and the contact in the Privacy notice at `/privacy`. Shown as given, in both languages. A missing one shows as "not given yet" on the page; the start does not stop. |
| `SESSION_ENCRYPTION_KEY` | required | 32 random bytes in base64. Encrypts OAuth tokens and DPoP keys in `auth.sqlite`. A new key signs every reader out. |
| `OAUTH_PRIVATE_KEY` | required with `PUBLIC_APP_ORIGIN` | The confidential client's ES256 private key, a JWK with a `kid`, as one line of JSON. Its public part is served at `/oauth/jwks.json`. |
| `SMTP_URL` | required | The SMTP server that sends Sign-in Codes, as `smtps://user:password@host:465` (or `smtp://…:587` with STARTTLS). Through Nodemailer, so any provider works; first choice Scaleway Transactional Email ([ADR 0016](docs/adr/0016-atomes-account-atproto-account-optional.md)). The start log names its host only. Not used by the dev server, whose mails go to `/dev/outbox`. |
| `MAIL_FROM` | required | The sender of the mails, for example `Atomes <atomes@example.org>`. Its domain must be verified at the SMTP provider (SPF, DKIM), or the mails land in spam. |
| `PORT` | `4321` | Port the server listens on inside the container. |
| `HOST` | `0.0.0.0` | Address the server listens on. |
| `DATA_DIR` | `/data` | Folder for all saved state: `catalog.sqlite`, `library.sqlite` (readers' Private records) and `auth.sqlite` (sign-in sessions). Mount a persistent volume here. |

- Health check: `GET /health` answers `200`. The image has a Docker `HEALTHCHECK` that calls it with `wget`.
- The server runs as user `node` (uid 1000). A named volume works as is; a host folder must be writable by uid 1000.
- The image holds no secrets: give every setting at run time.
