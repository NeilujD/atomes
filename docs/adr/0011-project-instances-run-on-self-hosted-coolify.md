# The project's instances run on a self-hosted Coolify server

Status: accepted

The project's own instances (staging now, production later) run on one Linux host that the owner rents, with [Coolify](https://coolify.io/docs) (open source, v4) installed on it. Coolify connects to the repository through a GitHub App, builds the `Dockerfile` on every push to `main`, serves the app behind its proxy with a Let's Encrypt certificate, and keeps `DATA_DIR` on a Docker volume. Coolify is only how the project runs its instances: self-hosters need only the Docker image (ADR 0007) and any HTTPS reverse proxy. Setup steps: `docs/staging-coolify.md`.

## Consequences

- No deploy file and no secret in the repository or in CI. The GitHub App key, the webhook secret and the setting values (`PUBLIC_APP_ORIGIN`) live in Coolify. CI keeps no deploy credentials.
- Coolify deploys on the push, not on the CI result. The `protect-main` ruleset merges a pull request only when the CI `check` job is green, so the commit Coolify builds has passed CI.
- One process writes the Catalog's SQLite file at a time. Coolify's rolling update starts the new container while the old one still runs on the same volume, so the app uses **Consistent name (no rolling updates)**. The cost is a few seconds without a server per deploy; the installed app keeps working offline during that time (ADR 0002).
- Coolify builds the image on the same host, so the host is sized for builds: 2 CPU cores, 4 GB RAM and 30 GB disk, above Coolify's minimum (2 cores, 2 GB RAM, 10 GB disk).
- The volume is local to the host and is not a backup. Volume backups must exist before a production instance.
- Each instance is its own OAuth client, named by its `PUBLIC_APP_ORIGIN` (ADR 0009), and has its own Catalog database (ADR 0007).

## Considered Options

- Tailscale Funnel on the owner's laptop (`docs/phone-https.md`): kept for phone tests of a branch, rejected for staging, because the app stops when the laptop sleeps.
- A hosted platform (Fly.io, Render, Railway): rejected, because each adds a paid hosted dependency and platform config in the repository, and the project would not run the same way a self-hoster does.
- Plain Docker with Caddy and a GitHub Actions deploy over SSH: rejected, because CI then needs an SSH key secret, and the project would write and maintain its own build, rollout and certificate steps.
