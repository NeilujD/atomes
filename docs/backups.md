# Backups of the Library and the Catalog

Every hour, the production instance sends an encrypted copy of `library.sqlite` and `catalog.sqlite` to a Cloudflare R2 bucket (ADR 0011, amendment 2026-11-09). This page tells how to set it up, how to restore, and keeps the log of restore tests.

## How it works

- A Coolify **Scheduled Task** runs `node dist/backup.mjs backup` in the app container every hour.
- For each file in `DATA_DIR`, the command writes a consistent copy with SQLite `VACUUM INTO`, compresses it with gzip and encrypts it with AES-256-GCM. Then it puts it in the bucket as `<stamp>/<file>.gz.enc`, for example `2026-11-09T15-00-00Z/library.sqlite.gz.enc`. The stamp is the UTC time of the run.
- The databases are in WAL mode, so the server keeps writing while the copy is made.
- The command is in the image (ADR 0007), but it runs only when the task calls it. A self-hoster who does not set it up is not affected.
- Up to one hour of changes can be lost. The Library file cannot be rebuilt. The Catalog file is a cache: the sources can rebuild it, so its backup only saves time.

Cost, from [R2 pricing](https://developers.cloudflare.com/r2/pricing/) (2026-10-30): 10 GB-month of storage, 1 million Class A operations (`PutObject`) and 10 million Class B operations (`GetObject`) are free each month, and egress is free. Two `PutObject` operations each hour come to about 1,500 a month. If the two compressed files are 1 MB together, 30 days of hourly copies are about 0.7 GB. Both numbers are far below the free tier.

## The settings

All five settings are **Runtime only** variables of the **production** app in Coolify. They are never in the repository or in CI.

| Name | Value |
| --- | --- |
| `BACKUP_S3_ENDPOINT` | `https://<account id>.r2.cloudflarestorage.com` ([S3 API](https://developers.cloudflare.com/r2/api/s3/api/)) |
| `BACKUP_S3_BUCKET` | the bucket name, for example `atomes-production-backups` |
| `BACKUP_S3_ACCESS_KEY_ID` | **Access Key ID** of the R2 API token |
| `BACKUP_S3_SECRET_ACCESS_KEY` | **Secret Access Key** of the R2 API token |
| `BACKUP_ENCRYPTION_KEY` | 32 random bytes in base64: `openssl rand -base64 32` |

**Keep `BACKUP_ENCRYPTION_KEY` in your password manager too.** If the host is lost, Coolify and its settings are lost with it. Without this key, no backup can be decrypted.

## Set it up

1. **Create the bucket.** In the Cloudflare dashboard, open **R2 object storage** and create a bucket, for example `atomes-production-backups` ([create buckets](https://developers.cloudflare.com/r2/buckets/create-buckets/)). Keep the default storage class, **Standard**: the free tier does not apply to Infrequent Access.
2. **Delete old copies.** In the bucket, open **Settings > Object lifecycle rules** and add a rule for all objects that deletes them after **30 days** ([object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)). Objects are removed within about 24 hours after that age.
3. **Create the API token.** On the **R2 object storage** page, next to **API Tokens**, select **Manage**, then **Create Account API token** ([authentication](https://developers.cloudflare.com/r2/api/tokens/)). Choose the **Object Read & Write** permission and scope it to this bucket only. Copy the **Access Key ID** and the **Secret Access Key**: the dashboard shows the secret only once.
4. **Make the encryption key.** On your Mac, run `openssl rand -base64 32` and save the output in your password manager.
5. **Add the settings.** In the production app in Coolify, open **Environment Variables** and add the five settings from the table above, runtime only ([environment variables](https://coolify.io/docs/applications/configuration/environment-variables)). Then select **Restart**.
6. **Add the task.** In the production app, open **Scheduled Tasks** and add one:

   | Field | Value |
   | --- | --- |
   | Name | `backup` |
   | Command | `node dist/backup.mjs backup` |
   | Frequency | `0 * * * *` (every hour, at minute 0) |

   *Not checked against the current Coolify docs: open the app's **Scheduled Tasks** page and use the labels it shows.*
7. **Run it once.** Start the task by hand, or open the app's **Terminal** and run `node dist/backup.mjs backup`. It prints `backup <stamp>: library.sqlite, catalog.sqlite`. In R2, the bucket has a `<stamp>/` folder with two objects.
8. **Get a message when a run fails.** If a run fails, the command exits with code 1 and prints `backup failed: <reason>`. In Coolify, turn on the notification for failed scheduled tasks under **Notifications**.

Staging holds test data only and needs no backup. If you want one anyway, use a second bucket and a second token: the two instances must never write to the same bucket.

## Restore

Restore writes into a `DATA_DIR` that has no database file. It does not overwrite a file. Before it gives each file its final name, it decrypts it and checks it with `PRAGMA integrity_check`. If one file fails, it writes nothing.

1. **Find the stamp.** In R2, open the bucket and pick a folder, usually the latest one, for example `2026-11-09T15-00-00Z`.
2. **On the host** (`ssh root@<host>`), find the app container and its image:

   ```sh
   docker ps --format '{{.Names}}  {{.Image}}'          # pick the production app
   APP=<container name>
   IMAGE=$(docker inspect --format '{{.Config.Image}}' "$APP")
   ```

3. **Copy the backup settings** out of the container into a file only root can read:

   ```sh
   umask 077
   docker exec "$APP" env | grep '^BACKUP_' > /root/backup.env
   ```

   If the app container is gone, write `/root/backup.env` by hand from your password manager and the R2 token.

4. **Restore into a fresh volume:**

   ```sh
   docker volume create atomes-restore
   docker run --rm --env-file /root/backup.env -v atomes-restore:/data "$IMAGE" \
     node dist/backup.mjs restore <stamp>
   shred -u /root/backup.env
   ```

   It prints `restored <stamp> into /data: library.sqlite, catalog.sqlite`.

5. **Check the content:**

   ```sh
   docker run --rm -v atomes-restore:/data "$IMAGE" node -e \
     "const {DatabaseSync}=require('node:sqlite');console.log(new DatabaseSync('/data/catalog.sqlite').prepare('select count(*) n from edition').get())"
   ```

6. **After a test**, remove the volume: `docker volume rm atomes-restore`.

After a real loss, restore into the app's own volume instead:

1. In Coolify, **Stop** the production app. Find its volume with `docker volume ls`. The name holds the app's id, which is also in **Persistent Storage**.
2. Move the old files aside. Restore never overwrites, and the old files can still help:

   ```sh
   VOLUME=<app volume>
   docker run --rm -v "$VOLUME":/data "$IMAGE" sh -c 'mkdir -p /data/before-restore && mv /data/*.sqlite* /data/before-restore/'
   ```

3. Run steps 3 and 4 with `-v "$VOLUME":/data` instead of `-v atomes-restore:/data`.
4. **Start** the app. The server opens the restored files and makes new `-wal` and `-shm` files.

## Restore log

A restore into a fresh volume is done once before the first real record (ADR 0011). After each test, add a line here.

| Date | Stamp restored | Files | Checked | By |
| --- | --- | --- | --- | --- |
| _not done yet_ | | | | |
