# Test on a phone over HTTPS

A phone cannot use the loopback client of local development: `127.0.0.1` is the phone itself. It needs the app on a public HTTPS origin, so it can install the app, run the service worker and sign in through the server's confidential client (ADR 0013). We use Tailscale Funnel on port 443, which gives a stable `<machine>.<tailnet>.ts.net` hostname (`docs/spikes/0001-oauth-and-spaces-alpha.md`, section 3).

The owner runs these steps with their own Tailscale account. Nothing here goes into the repo: the hostname and the keys stay in `.env.phone`, which Git ignores.

## Once per machine

1. Install Tailscale and sign in.
2. In the [admin console](https://login.tailscale.com/admin/dns), turn on MagicDNS and HTTPS certificates.
3. Allow Funnel for this machine: the first `tailscale funnel` command prints a link to do it if it is not allowed yet ([docs](https://tailscale.com/docs/reference/tailscale-cli/funnel)).
4. Find the hostname: `tailscale status --json | grep '"DNSName"' | head -1`. Drop the final dot.
5. Make the two keys of this test instance (run each command once):

   ```sh
   openssl rand -base64 32
   node -e "const c=require('node:crypto');const {privateKey}=c.generateKeyPairSync('ec',{namedCurve:'P-256'});console.log(JSON.stringify({...privateKey.export({format:'jwk'}),kid:c.randomUUID(),alg:'ES256'}))"
   ```

6. Create `.env.phone` at the repo root. Put the JSON key in single quotes, on one line:

   ```sh
   PUBLIC_APP_ORIGIN=https://<machine>.<tailnet>.ts.net
   ALLOWED_DIDS=did:plc:<your test account>
   SESSION_ENCRYPTION_KEY=<the openssl output>
   OAUTH_PRIVATE_KEY='<the node output>'
   DATA_DIR=data-phone
   ```

   Not `.env.local`: `bun run dev` reads `.env.local`, and with `PUBLIC_APP_ORIGIN` there the dev server would be the client of the Funnel origin, so sign-in on `127.0.0.1` would fail. An older `.env.local` that holds `PUBLIC_APP_ORIGIN` must lose it. `DATA_DIR=data-phone` keeps the phone test data apart from the development data.

## Each test session

1. Stop the dev server first (also Jean's Run environment): it uses the same port 4321. If it still runs, `bun run phone` stops with `EADDRINUSE`, and a funnel to the dev server only shows Vite's "Blocked request" page.
2. Start the app: `bun run phone`. It checks the settings, builds the app and serves it on `http://127.0.0.1:4321` with the settings of `.env.phone`. It stops before the build, with a message, when a setting is missing or wrong (for example `PUBLIC_APP_ORIGIN` without `https://`, or no `OAUTH_PRIVATE_KEY`). The dev server is not enough: it does not register the service worker, so the phone cannot install the app.
3. In a second terminal: `tailscale funnel 4321`. The first time, public DNS can take up to 10 minutes.
4. Check the public path, the one the PDS and the phone use. The first answer has `client_id` on that hostname; the second has one public key, with no `d` member:

   ```sh
   H=<machine>.<tailnet>.ts.net
   IP=$(dig +short "$H" @1.1.1.1 | head -1)
   curl --resolve "$H:443:$IP" "https://$H/oauth/client-metadata.json"
   curl --resolve "$H:443:$IP" "https://$H/oauth/jwks.json"
   ```

   A plain `curl https://$H/...` from the same Mac fails with `SSL_ERROR_SYSCALL`: MagicDNS sends the Mac to its own tailnet IP, and that path does not answer. This does not affect the phone.
5. On the phone, open `https://<machine>.<tailnet>.ts.net`, add the app to the home screen, open it from there and sign in with the test handle. Add a book, reload: the book is still there. Sign out.
6. Stop: `Ctrl-C` in both terminals. Check that nothing stays public: `tailscale funnel status --json` prints `{}`.

## Rules and pitfalls

- The Funnel URL is public while it runs, and since ADR 0012 the server stores the Library records of whoever signs in. Only DIDs on `ALLOWED_DIDS` can sign in. Use test data only, and stop the funnel after the test.
- Keep the phone on one origin from sign-in to callback: the session cookie belongs to one origin.
- After a change to the scope or the metadata, the PDS can keep the old values for about 30 minutes (spike 0001, risk 6). Wait before you debug a failed sign-in.
- The sign-in scope needs no published lexicon (spike 0003, section 3).
- `tailscale funnel status` prints `No serve config` while `tailscale funnel 4321` runs: this is normal. A foreground funnel is stored per session, and only `tailscale funnel status --json` shows it (under `Foreground`). If the funnel command printed a link to turn on HTTPS or Funnel, open it, then run the command again.
- Do not use `--bg` for test sessions: it keeps the funnel on after a reboot.
