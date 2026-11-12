# Run staging on Coolify

Staging is the project's instance that runs without the owner's laptop (ADR 0011). One rented Linux host runs Coolify. Coolify builds the `Dockerfile` on every merge to `main` and serves the app on `https://<staging hostname>`.

The owner runs these steps with their own accounts. Nothing here goes into the repository or into CI: the GitHub App key, the webhook secret and the settings stay in Coolify.

Checked against the Coolify docs for v4.6.0 (2026-11-02), source [coollabsio/coolify-docs](https://github.com/coollabsio/coolify-docs), and the [v4.7.0 to v4.7.4 release notes](https://github.com/coollabsio/coolify/releases) (2026-11-10). Coolify changes labels between versions: if a label below is not in your dashboard, look it up on the linked page.

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
| `A` | `*.staging` | host IPv4 (preview deployments, step 11) |

On Cloudflare, set each record to **DNS only** (grey cloud). A proxied record puts a second proxy in front of Coolify's (see step 6), and the Let's Encrypt HTTP challenge then goes to Cloudflare.

Add `AAAA` records only if the host accepts IPv6: a broken IPv6 path makes certificate requests fail. Check from your Mac: `dig +short staging.<domain> A` prints the host IPv4.

## 3. Install Coolify

1. Connect: `ssh root@<host IPv4>`.
2. Install ([self-hosted install](https://coolify.io/docs/start-with-self-hosted)):

   ```sh
   curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
   ```

3. **Immediately** open `http://<host IPv4>:8000` and create the admin account. Until you do, anyone who opens that page first becomes the admin, with root access to the host.
4. Copy `/data/coolify/source/.env` from the host into your password manager. It holds `APP_KEY`, which a restore of Coolify needs. Never put it in the repository.
5. Add 4 GB of swap. Coolify builds the image on this host (ADR 0011): with no swap, a build that fills the RAM can freeze the host, and the apps and the dashboard stop answering. Check first: if `swapon --show` already lists a swap, or `df -h /` shows less than 6 GB free, skip this step.

   ```sh
   fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
   echo '/swapfile none swap sw 0 0' >> /etc/fstab
   echo 'vm.swappiness=10' > /etc/sysctl.d/99-swap.conf && sysctl --system >/dev/null
   ```

   `swapon --show` now lists `/swapfile` with size `4G`. With `vm.swappiness=10`, Linux uses the swap only when the RAM is nearly full: a big build is slower, but the host keeps answering.

## 4. Set up the dashboard

1. In Coolify, open **Settings > General**, set **URL** to `https://coolify.<domain>` and select **Save changes** ([instance settings](https://coolify.io/docs/core/instance-management/instance-settings)). Turn on **Redirect HTTP to HTTPS**.
2. Open `https://coolify.<domain>` and sign in there from now on.
3. In the provider firewall, close `8000`, `6001` and `6002`. Keep `22`, `80` and `443`: GitHub webhooks and certificates use `80` and `443`.
4. Open **Servers > localhost > Configuration > Advanced**, set **Concurrent Builds** to `1` and save ([manage a server](https://coolify.io/docs/core/infrastructure/servers/manage-server)). The default is `2`: a preview build and a staging build would then run at the same time on this host. With `1`, the second one waits in the queue.
5. Open **Servers > localhost > Sentinel**, turn on **Sentinel**, then **Metrics** ([metrics](https://coolify.io/docs/core/observability/monitoring/metrics)). The server's **Metrics** tab then shows CPU and RAM per server and per container, for 7 days by default. Look at it after a build to see how much RAM a build takes.

## 5. Connect the GitHub App

The GitHub App gives Coolify read access to the repository and sets the push webhook and its secret for you ([GitHub App](https://coolify.io/docs/applications/sources/github/app)).

1. **Sources > New source > GitHub App**. Give it a name. Leave **Organization** empty (the repository is on a personal account). Select **Continue**.
2. Under **Webhook endpoint**, choose **Use an instance endpoint** (`https://coolify.<domain>`). Set **Preview deployment access** to **Read and update pull requests**, then **Register with GitHub**. For an app made without it: on GitHub, give the app **Pull requests: Read and write** and subscribe it to the **Pull request** event ([preview deployments](https://coolify.io/docs/applications/sources/github/preview-deploy)).
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

4. Leave **Ports Mappings** empty. A port published on the host goes around the proxy and the firewall. It would also break the ISBN lookup limit per IP (ADR 0010, "Catalog access"): the server trusts only the last `X-Forwarded-For` entry, the one the proxy adds, so it must be behind exactly one proxy. Do not put a CDN or a second proxy in front of Coolify's.

## 7. Set the hostname with HTTPS

In the app, **Domains > Add domain** ([domains](https://coolify.io/docs/core/networking/domains)):

- **Protocol**: **https**
- **Domain**: `staging.<domain>`
- **Port**: empty (Coolify then uses **Ports Exposes**, `4321`)

With **https**, the proxy gets and renews a Let's Encrypt certificate. It needs the DNS record of step 2 and ports `80` and `443` open.

## 8. Set the settings

The server signs readers in as an OAuth confidential client and keeps their Private records (ADR 0012, ADR 0013). It does not start when a required setting is missing or wrong: the deployment log names each one.

1. On your Mac, make the two secrets of this instance. Run each command once and keep the output in your password manager; never put it in the repository:

   ```sh
   # SESSION_ENCRYPTION_KEY: encrypts the OAuth tokens and DPoP keys in /data/auth.sqlite
   openssl rand -base64 32
   # OAUTH_PRIVATE_KEY: the confidential client's ES256 private key, as one line of JSON
   node -e "const c=require('node:crypto');const {privateKey}=c.generateKeyPairSync('ec',{namedCurve:'P-256'});console.log(JSON.stringify({...privateKey.export({format:'jwk'}),kid:c.randomUUID(),alg:'ES256'}))"
   ```

2. Find the DID of each account that may sign in: `curl -s 'https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=<handle>'`.
3. In the app, **Environment Variables** ([environment variables](https://coolify.io/docs/applications/configuration/environment-variables)), add these variables. For each one: **Not available during build**, **Available in the container**. If the start stops with "OAUTH_PRIVATE_KEY must be an ES256 private JWK", the JSON was changed on the way in: paste it again as one line.

| Name | Value |
| --- | --- |
| `PUBLIC_APP_ORIGIN` | `https://staging.<domain>` |
| `ALLOWED_DIDS` | The DIDs that may sign in, separated by commas: `did:plc:…,did:plc:…` |
| `SESSION_ENCRYPTION_KEY` | The `openssl` output |
| `OAUTH_PRIVATE_KEY` | The `node` output (one line, starts with `{"kty":"EC"`) |
| `APP_ENV` | `staging` (`production` in the production app) |

- `PUBLIC_APP_ORIGIN` is the origin only: `https://`, the hostname, no path, no final `/`.
- A DID that is not on `ALLOWED_DIDS` sees "This account may not sign in to this Atomes server" and the instance keeps nothing for it.
- A new `SESSION_ENCRYPTION_KEY` signs every reader out: the stored sessions can no longer be read. A new `OAUTH_PRIVATE_KEY` makes the PDS refuse the old sessions at their next refresh. Change them only after a leak.
- `APP_ENV` names the instance: outside `production`, every screen shows a grey Staging pill and the app has an orange icon and the name "Atomes Staging". A pull request preview shows Preview by itself. With no value, the app counts as staging; any other value stops the start.
- Do not set `DATA_DIR`, `PORT` or `HOST`: the image defaults (`/data`, `4321`, `0.0.0.0`) are the right values.
- After a change of settings only, **Restart** is enough. The PDS can keep the old client metadata for about 30 minutes.

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
2. Turn on **Preview Deployments**: each pull request gets its own container on `https://<pr number>.staging.<domain>` (the default template `{{pr_id}}.{{domain}}`, covered by the `*.staging` record of step 2). Leave **Allow Public PR Deployments** off: with it on, a pull request from anyone would run its code on the host ([preview deployments](https://coolify.io/docs/applications/sources/github/preview-deploy)). Never turn previews on in the production app.

   A preview has no settings of its own, so since v4.7.4 it gets the staging runtime variables. Sign-in works there with no manual step: on a preview, Coolify sets `COOLIFY_BRANCH=pull/<pr number>/head` and the preview URL in `COOLIFY_URL` (or `COOLIFY_FQDN`, by Coolify version), and the server takes its origin from that URL, not from `PUBLIC_APP_ORIGIN`. Each preview is then its own OAuth client (`client_id` on `https://<pr number>.staging.<domain>`), with the staging `OAUTH_PRIVATE_KEY`, `SESSION_ENCRYPTION_KEY` and `ALLOWED_DIDS`. A preview has its own volume: its Library store and Catalog start empty, and a staging sign-in does not carry over.
3. Select **Deploy** once for the first build. From then on, each merge to `main` deploys.

Coolify builds on the push, not on the CI result. `protect-main` only merges a pull request whose CI `check` job is green, so what Coolify builds has passed CI.

## Check the acceptance criteria

1. **HTTPS and settings.** From your Mac:

   ```sh
   curl -s -o /dev/null -w '%{http_code}\n' https://staging.<domain>/health   # 200
   curl -s https://staging.<domain>/oauth/client-metadata.json                # client_id on staging.<domain>, private_key_jwt
   curl -s https://staging.<domain>/oauth/jwks.json                           # one public key: no "d" member
   ```

2. **Phone sign-in.** On the phone, open `https://staging.<domain>`, add the app to the home screen, open it from there and sign in with a handle on `ALLOWED_DIDS`. Add a book, reload: the book is still there.
3. **Merge deploys with no manual step.** Merge a pull request to `main`. In the app's **Deployments**, a new deployment starts for the merge commit, with no click. When it ends, `/health` answers `200` again.
4. **A pull request gets a preview.** Open a pull request from a branch of this repository. In the app's **Preview Deployments**, a deployment starts for it, and `curl -s -o /dev/null -w '%{http_code}\n' https://<pr number>.staging.<domain>/health` prints `200`. On the host, `docker volume ls` shows a separate volume for the preview: it must not use the staging volume. `curl -s https://<pr number>.staging.<domain>/oauth/client-metadata.json` shows `client_id` on the preview hostname; sign in there, add a book, sign out. Closing the pull request removes the preview.
5. **Data survives a redeploy.**
   1. Look up a book so the Catalog saves it: `curl -s https://staging.<domain>/api/catalog/editions/9782723478991`.
   2. In the app's **Terminal**, count the saved Editions:

      ```sh
      node -e "const {DatabaseSync}=require('node:sqlite');console.log(new DatabaseSync('/data/catalog.sqlite').prepare('select count(*) n from edition').get())"
      ```

   3. Select **Redeploy**, wait for the end, open **Terminal** again and run the same command. The count is the same or higher.

## Reset the data

To start again with an empty instance (debugging, tests), empty its SQLite files. Every browser is signed out; the Library and the Catalog are empty. Records on the PDS do not change. The container keeps running: no restart.

### A button in the dashboard (staging)

Set it up once. Then a reset is one click in the Coolify dashboard, also on a phone.

1. In the **staging** app, open **Scheduled Tasks** and select **+ Add** ([create a task](https://coolify.io/docs/core/automation/scheduled-tasks/create-a-task)):
   - Name: `Reset the data`
   - Command: `node scripts/reset-env.ts` (or `node scripts/reset-env.ts --keep-catalog`, so no book source is asked again)
   - Frequency: `0 4 1 1 *` (a value is required; the task is disabled at step 2, so it never runs on it)
   - Timeout: `60`. Container: empty. **Run in a shell**: on.
2. Open the task and select **Disable**. A disabled task never runs on its schedule ([manage tasks](https://coolify.io/docs/core/automation/scheduled-tasks/manage-tasks#enable-or-disable-a-task)).

To reset: open the staging app, **Scheduled Tasks**, **Reset the data**, then **Execute now**. **Execute now** stays on a disabled task: it shows when the app is running and does not check the Enabled state ([`show.blade.php`](https://github.com/coollabsio/coolify/blob/v4.7.5/resources/views/livewire/project/shared/scheduled-task/show.blade.php#L26-L37), [`executeNow()`](https://github.com/coollabsio/coolify/blob/v4.7.5/app/Livewire/Project/Shared/ScheduledTask/Show.php#L167-L172), Coolify v4.7.5). Open **Executions** to read the output: each file and its count of deleted rows. Then sign in again.

- Never **Enable** the task: it would then reset staging every year on 1 January at 04:00.
- Never add the task to the production app: a click would empty production. The command refuses production anyway without `--production`.
- For a pull request preview, use the Terminal.

### The Terminal (production, previews)

1. In the app, open **Terminal** and pick the app container.
2. Run one of these commands:

   ```sh
   node scripts/reset-env.ts                  # staging or a preview: sessions, Library, Catalog
   node scripts/reset-env.ts --keep-catalog   # the same, but keep the Catalog: no book source is asked again
   node scripts/reset-env.ts --production     # production: take a backup first (node dist/backup.mjs backup)
   ```

3. The command prints each file and its count of deleted rows. Sign in again.

The command refuses production without `--production`, and refuses an image with no `APP_ENV`: such an instance may be production with a missing setting.

## Rules and pitfalls

- If production shows the grey Staging pill, the orange icon or the name "Atomes Staging", its `APP_ENV` is not `production` in the container. In the **production** app, **Environment Variables**, set `APP_ENV` = `production` with **Available in the container** on, then **Restart**. The start log says which instance it is: `Atomes settings are fine: production, …`.

- No secret in the repository or in CI. The GitHub App key, the webhook secret, `SESSION_ENCRYPTION_KEY` and `OAUTH_PRIVATE_KEY` stay in Coolify, `APP_KEY` and copies of the two keys in your password manager.
- The volume lives on this host only and is not a backup. Production backs up to R2 every hour: `docs/backups.md`.
- A failed health check fails the deploy. With rolling updates off, the old container is already stopped, so staging stays down until a good deploy. Read the deployment log, fix on a branch, merge again.
- Keep the phone on one origin from sign-in to callback: the DPoP key, PKCE verifier and state are stored per origin. A staging sign-in does not carry over to a Funnel hostname.
- If the host stops answering during a build (ports open, but HTTPS requests wait), the RAM is full. Connect with SSH, or with the provider's web console if SSH waits too. Run `free -h` and `docker stats --no-stream`, and stop the build container if it takes the RAM. Then check that the swap and **Concurrent Builds** of steps 3 and 4 are in place, and look at the peak in **Metrics**.
- If the certificate does not come, check DNS first (`dig +short staging.<domain> A`), then that `80` and `443` reach the host ([Let's Encrypt not working](https://coolify.io/docs/troubleshoot/dns-and-domains/lets-encrypt-not-working)).
