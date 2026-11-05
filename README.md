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

## Run with Docker

One image runs the whole server ([ADR 0007](docs/adr/0007-one-docker-image-astro-node-and-sqlite.md)). The project's instances and self-hosters use the same image.

```sh
docker build -t atomes .
docker run -d --name atomes -p 4321:4321 -v atomes-data:/data \
  -e PUBLIC_APP_ORIGIN=https://atomes.example.org atomes
```

Put an HTTPS reverse proxy in front of it (Coolify, Caddy, Traefik): sign-in needs the app on its https origin. The project's own staging runs on Coolify ([ADR 0011](docs/adr/0011-project-instances-run-on-self-hosted-coolify.md)): [docs/staging-coolify.md](docs/staging-coolify.md).

| Setting | Default | What it does |
| --- | --- | --- |
| `PUBLIC_APP_ORIGIN` | not set | The https origin readers open, for example `https://atomes.example.org`. Without it, sign-in does not work. |
| `PORT` | `4321` | Port the server listens on inside the container. |
| `HOST` | `0.0.0.0` | Address the server listens on. |
| `DATA_DIR` | `/data` | Folder for all saved state (the Catalog database, later). Mount a persistent volume here. |

- Health check: `GET /health` answers `200`. The image has a Docker `HEALTHCHECK` that calls it with `wget`.
- The server runs as user `node` (uid 1000). A named volume works as is; a host folder must be writable by uid 1000.
- The image holds no secrets: give every setting at run time.
