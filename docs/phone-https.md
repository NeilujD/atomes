# Test on a phone over HTTPS

A phone cannot use the loopback client of local development: `127.0.0.1` is the phone itself. It needs the app on a public HTTPS origin, so it can install the app, run the service worker and sign in with the published client metadata (ADR 0009). We use Tailscale Funnel on port 443, which gives a stable `<machine>.<tailnet>.ts.net` hostname (`docs/spikes/0001-oauth-and-spaces-alpha.md`, section 3).

The owner runs these steps with their own Tailscale account. Nothing here goes into the repo: the hostname stays in `.env.local`, which Git ignores.

## Once per machine

1. Install Tailscale and sign in.
2. In the [admin console](https://login.tailscale.com/admin/dns), turn on MagicDNS and HTTPS certificates.
3. Allow Funnel for this machine: the first `tailscale funnel` command prints a link to do it if it is not allowed yet ([docs](https://tailscale.com/docs/reference/tailscale-cli/funnel)).
4. Find the hostname: `tailscale status --json | grep '"DNSName"' | head -1`. Drop the final dot.
5. Create `.env.local` at the repo root:

   ```sh
   PUBLIC_APP_ORIGIN=https://<machine>.<tailnet>.ts.net
   ```

## Each test session

1. Stop the dev server first (also Jean's Run environment): it uses the same port 4321. If it still runs, `bun run phone` stops with `EADDRINUSE`, and a funnel to the dev server only shows Vite's "Blocked request" page.
2. Start the app: `bun run phone`. It builds the app and serves it on `http://127.0.0.1:4321` with `PUBLIC_APP_ORIGIN` from `.env.local`. The dev server is not enough: it does not register the service worker, so the phone cannot install the app.
3. In a second terminal: `tailscale funnel 4321`. The first time, public DNS can take up to 10 minutes.
4. Check the public path, the one the PDS and the phone use. It returns JSON with `client_id` on that hostname:

   ```sh
   H=<machine>.<tailnet>.ts.net
   curl --resolve "$H:443:$(dig +short "$H" @1.1.1.1 | head -1)" "https://$H/oauth/client-metadata.json"
   ```

   A plain `curl https://$H/...` from the same Mac fails with `SSL_ERROR_SYSCALL`: MagicDNS sends the Mac to its own tailnet IP, and that path does not answer. This does not affect the phone.
5. On the phone, open `https://<machine>.<tailnet>.ts.net`, add the app to the home screen, open it from there and sign in with the test handle.
6. Stop: `Ctrl-C` in both terminals. Check that nothing stays public: `tailscale funnel status --json` prints `{}`.

## Rules and pitfalls

- The Funnel URL is public while it runs. The server holds no Library data (ADR 0001), but stop the funnel after the test.
- Keep the phone on one origin from sign-in to callback: the DPoP key, PKCE verifier and state are stored per origin.
- After a change to the scope or the metadata, the PDS can keep the old values for about 30 minutes (spike, risk 6). Wait before you debug a failed sign-in.
- Sign-in asks for the Space scope, so the `app.atomes.*` lexicons must be published (`scripts/publish-lexicons.ts`).
- `tailscale funnel status` prints `No serve config` while `tailscale funnel 4321` runs: this is normal. A foreground funnel is stored per session, and only `tailscale funnel status --json` shows it (under `Foreground`). If the funnel command printed a link to turn on HTTPS or Funnel, open it, then run the command again.
- Do not use `--bg` for test sessions: it keeps the funnel on after a reboot.
