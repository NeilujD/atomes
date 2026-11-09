# Run staging on Coolify

Staging is the project's instance that runs without the owner's laptop (ADR 0011). One rented Linux host runs Coolify. Coolify builds the `Dockerfile` on every merge to `main` and serves the app on `https://<staging hostname>`.

The owner runs these steps with their own accounts. Nothing here goes into the repository or into CI: the GitHub App key, the webhook secret and the settings stay in Coolify.

Checked against the Coolify docs for v4.6.0 (2026-11-02), source [coollabsio/coolify-docs](https://github.com/coollabsio/coolify-docs). Coolify changes labels between versions: if a label below is not in your dashboard, look it up on the linked page.

In this page, `<domain>` is a domain the owner controls, the dashboard is on `coolify.<domain>` and the app is on `staging.<domain>`. Use other names if you want: only `PUBLIC_APP_ORIGIN` must match the app hostname.

## 1. Rent the host

- Linux, amd64 or arm64. A fresh Ubuntu LTS or Debian server is the simple choice ([supported systems](https://coolify.io/docs/start-with-self-hosted)).
- 2 CPU cores, 4 GB RAM, 30 GB disk. Coolify needs at least 2 cores, 2 GB RAM and 10 GB disk, but it builds the image on this host, and builds need more.
- SSH access as `root` (the automated install needs root).
- In the provider firewall, open `22`, `80`, `443`, `8000`, `6001` and `6002` (TCP) for now ([firewall](https://coolify.io/docs/core/infrastructure/servers/firewall)). Use the provider firewall, not UFW alone: Docker-published ports go around UFW.

## 2. Point DNS to the host

At the DNS provider of `<domain>`, add two `A` records to the host's public IPv4 address ([DNS](https://coolify.io/docs/core/networking/dns)):

| Type | Name | Value |
| --- | --- | --- |
| `A` | `coolify` | host IPv4 |
| `A` | `staging` | host IPv4 |

Add `AAAA` records only if the host accepts IPv6: a broken IPv6 path makes certificate requests fail. Check from your Mac: `dig +short staging.<domain> A` prints the host IPv4.

## 3. Install Coolify

1. Connect: `ssh root@<host IPv4>`.
2. Install ([self-hosted install](https://coolify.io/docs/start-with-self-hosted)):

   ```sh
   curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
   ```

3. **Immediately** open `http://<host IPv4>:8000` and create the admin account. Until you do, anyone who opens that page first becomes the admin, with root access to the host.
4. Copy `/data/coolify/source/.env` from the host into your password manager. It holds `APP_KEY`, which a restore of Coolify needs. Never put it in the repository.

## 4. Put the dashboard on HTTPS

1. In Coolify, open **Settings > General**, set **URL** to `https://coolify.<domain>` and select **Save changes** ([instance settings](https://coolify.io/docs/core/instance-management/instance-settings)). Turn on **Redirect HTTP to HTTPS**.
2. Open `https://coolify.<domain>` and sign in there from now on.
3. In the provider firewall, close `8000`, `6001` and `6002`. Keep `22`, `80` and `443`: GitHub webhooks and certificates use `80` and `443`.

## 5. Connect the GitHub App

The GitHub App gives Coolify read access to the repository and sets the push webhook and its secret for you ([GitHub App](https://coolify.io/docs/applications/sources/github/app)).

1. **Sources > New source > GitHub App**. Give it a name. Leave **Organization** empty (the repository is on a personal account). Select **Continue**.
2. Under **Webhook endpoint**, choose **Use an instance endpoint** (`https://coolify.<domain>`), then **Register with GitHub**.
3. On GitHub, select **Create GitHub App**.
4. Back in Coolify, select **Install repositories**, choose **Only select repositories**, pick `NeilujD/atomes` and select **Install**.

## 6. Create the app

1. **+ New > Private Repository (with GitHub App)**. This source also works for a public repository, and it is the one that deploys on push without a hand-made webhook.
2. Choose the server (`localhost`, the Coolify host), the GitHub App, then **Load Repository** and pick `NeilujD/atomes`, branch `main`.
3. Set **Build pack** to **Dockerfile** ([Dockerfile build pack](https://coolify.io/docs/applications/builds/dockerfile)):

   | Field | Value |
   | --- | --- |
   | **Base Directory** | `/` |
   | **Dockerfile Location** | `/Dockerfile` |
   | **Ports Exposes** | `4321` |

4. Leave **Ports Mappings** empty. A port published on the host goes around the proxy and the firewall.

## 7. Set the hostname with HTTPS

In the app, **Domains > Add domain** ([domains](https://coolify.io/docs/core/networking/domains)):

- **Protocol**: **https**
- **Domain**: `staging.<domain>`
- **Port**: empty (Coolify then uses **Ports Exposes**, `4321`)

With **https**, the proxy gets and renews a Let's Encrypt certificate. It needs the DNS record of step 2 and ports `80` and `443` open.

## 8. Set `PUBLIC_APP_ORIGIN`

In the app, **Environment Variables** ([environment variables](https://coolify.io/docs/applications/configuration/environment-variables)), add one variable:

| Name | Value | Build time | Runtime |
| --- | --- | --- | --- |
| `PUBLIC_APP_ORIGIN` | `https://staging.<domain>` | **Not available during build** | **Available in the container** |

- The value is the origin only: `https://`, the hostname, no path, no final `/`. Without `https://`, sign-in shows "This Atomes server is not set up for sign-in".
- Do not set `DATA_DIR`, `PORT` or `HOST`: the image defaults (`/data`, `4321`, `0.0.0.0`) are the right values.
- After a change of this value only, **Restart** is enough. The PDS can keep the old client metadata for about 30 minutes.

## 9. Keep the data folder on a volume

In the app, **Persistent Storage > Add** ([persistent storage](https://coolify.io/docs/applications/configuration/persistent-storage)):

- Type: **Volume Mount** (a Docker volume). Leave **Source Path** empty.
- **Destination Path**: `/data`

The server runs as user `node` (uid 1000). A new Docker volume takes the owner of the image's `/data`, so it is writable. Do not use a **Directory Mount** unless that host folder belongs to uid 1000.

## 10. Turn off rolling updates

In the app, **Container > Container naming**: choose **Consistent name (no rolling updates)** ([advanced settings](https://coolify.io/docs/applications/configuration/advanced), [rolling updates](https://coolify.io/docs/applications/deployments/rolling-updates)).

A rolling update starts the new container while the old one still runs, on the same volume. Both would then open `catalog.sqlite` (ADR 0011). With a fixed name, Coolify stops the old container first. Staging is down for a few seconds per deploy; the installed app keeps working offline.

There is no health check to set: Coolify uses the image's `HEALTHCHECK` (`GET /health`) and ignores the dashboard one ([health checks](https://coolify.io/docs/applications/configuration/health-checks)).

## 11. Deploy from `main`

1. In the app, check **Advanced > Deployment > Auto deploy** is **Deploy on push (webhooks)** ([auto deploy](https://coolify.io/docs/applications/sources/github/auto-deploy)). It is the default for an app made from a GitHub App.
2. Leave **Preview Deployments** and **Allow Public PR Deployments** off: a pull request from anyone would run its code on the host ([preview deployments](https://coolify.io/docs/applications/sources/github/preview-deploy)).
3. Select **Deploy** once for the first build. From then on, each merge to `main` deploys.

Coolify builds on the push, not on the CI result. `protect-main` only merges a pull request whose CI `check` job is green, so what Coolify builds has passed CI.

## Check the acceptance criteria

1. **HTTPS and settings.** From your Mac:

   ```sh
   curl -s -o /dev/null -w '%{http_code}\n' https://staging.<domain>/health   # 200
   curl -s https://staging.<domain>/oauth/client-metadata.json                # client_id on staging.<domain>
   ```

2. **Phone sign-in.** On the phone, open `https://staging.<domain>`, add the app to the home screen, open it from there and sign in with the test handle. Sign-in asks for the Space scope, so the `app.atomes.*` lexicons must be published (`scripts/publish-lexicons.ts`).
3. **Merge deploys with no manual step.** Merge a pull request to `main`. In the app's **Deployments**, a new deployment starts for the merge commit, with no click. When it ends, `/health` answers `200` again.
4. **Data survives a redeploy.**
   1. Look up a book so the Catalog saves it: `curl -s https://staging.<domain>/api/catalog/editions/9782723478991`.
   2. In the app's **Terminal**, count the saved Editions:

      ```sh
      node -e "const {DatabaseSync}=require('node:sqlite');console.log(new DatabaseSync('/data/catalog.sqlite').prepare('select count(*) n from edition').get())"
      ```

   3. Select **Redeploy**, wait for the end, open **Terminal** again and run the same command. The count is the same or higher.

## Rules and pitfalls

- No secret in the repository or in CI. The GitHub App key and webhook secret stay in Coolify, `APP_KEY` in your password manager.
- The volume lives on this host only and is not a backup. Production backs up to R2 every hour: `docs/backups.md`.
- A failed health check fails the deploy. With rolling updates off, the old container is already stopped, so staging stays down until a good deploy. Read the deployment log, fix on a branch, merge again.
- Keep the phone on one origin from sign-in to callback: the DPoP key, PKCE verifier and state are stored per origin. A staging sign-in does not carry over to a Funnel hostname.
- If the certificate does not come, check DNS first (`dig +short staging.<domain> A`), then that `80` and `443` reach the host ([Let's Encrypt not working](https://coolify.io/docs/troubleshoot/dns-and-domains/lets-encrypt-not-working)).
