# Runbook

Operational procedures for a running Menuland server. Everything here is a
command you can copy.

If you are reading this because something is broken, go straight to
[The app is down](#the-app-is-down). Nothing above that section is urgent.

Assumptions, all set by `docs/LINUX-DEPLOY.md`:

| Thing         | Where                                        |
| ------------- | -------------------------------------------- |
| Application   | `/srv/menuland`                              |
| Customer data | `/var/lib/menuland` (uploads, backups, logs) |
| Service       | `menuland` (systemd)                         |
| Config        | `/srv/menuland/.env`                         |
| Database      | PostgreSQL, database `menuland`              |

Substitute your own paths if you deployed somewhere else.

---

## The app is down

Work top to bottom. Stop as soon as something answers.

### 1. Ask the app itself

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://YOUR-DOMAIN/api/health
```

- **200** — the app is up and the database is fine. The problem is nginx, DNS,
  TLS, or the network. Skip to step 3.
- **503** — the app is running but cannot reach the database. Go to step 4.
- **Nothing / connection refused / timeout** — the app is not running. Step 2.

For the detail behind the status code:

```bash
curl -s https://YOUR-DOMAIN/api/health
```

That returns the version, whether the database answered, whether the uploads
directory is writable, and the free bytes on the data volume. It needs no login
and returns nothing sensitive, so it is safe to call from anywhere.

### 2. Is the process running?

```bash
sudo systemctl status menuland
```

If it is not running, start it and watch what happens:

```bash
sudo systemctl start menuland && sudo journalctl -u menuland -f
```

Press `Ctrl+C` to stop watching.

**If it starts and then immediately dies**, the app is usually refusing to boot
on purpose. Read the last error:

```bash
sudo journalctl -u menuland -n 50 --no-pager
```

The app deliberately refuses to start when:

| Message mentions       | Fix                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`          | Still the example value. Generate a real one (see below).                                            |
| `NEXT_PUBLIC_APP_URL`  | Set to localhost, or to `http://`. It must be your real `https://` domain.                           |
| `ZARINPAL_MERCHANT_ID` | `PAYMENT_PROVIDER="zarinpal"` with no merchant id. Set the id, or set the provider back to `"mock"`. |
| `DATABASE_URL`         | Missing or wrong. Check `/srv/menuland/.env`.                                                        |

These are not bugs. The error message names the variable. Edit
`/srv/menuland/.env`, then `sudo systemctl restart menuland`.

To generate a new `AUTH_SECRET` (this signs out every logged-in user, which is
harmless — they just sign in again):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### 3. Is nginx the problem?

```bash
sudo nginx -t && sudo systemctl status nginx
```

If the config test fails it tells you the file and line. Fix, then:

```bash
sudo systemctl reload nginx
```

**Guest menus load but the kitchen board never updates live** — nginx is
buffering the event stream. Confirm `proxy_buffering off;` is in the site config,
then reload.

### 4. Is the database up?

```bash
sudo systemctl status postgresql
```

```bash
sudo -u postgres psql -d menuland -c "\dt"
```

If that lists tables, the database is fine and the app just cannot reach it —
check `DATABASE_URL` in `/srv/menuland/.env`.

If PostgreSQL is not running:

```bash
sudo systemctl start postgresql && sudo systemctl restart menuland
```

### 5. Is the disk full?

A full disk takes down uploads and the database at the same time and looks like
a dozen unrelated faults.

```bash
df -h
```

```bash
du -sh /var/lib/menuland/*
```

Backups are the usual culprit. They self-prune to the newest 14, but if that
never ran the folder grows without limit. Safe to delete old archives by hand —
keep the most recent few:

```bash
ls -lt /var/lib/menuland/backups/
```

### 6. Nothing above worked

Restart the whole stack:

```bash
sudo systemctl restart postgresql menuland nginx
```

Then re-run step 1. If it is still down, take a backup before you experiment
further — see [Take a backup](#take-a-backup).

---

## Read the logs

**Application** — everything the app prints, including startup errors and
crashes:

```bash
sudo journalctl -u menuland -n 100 --no-pager
```

Follow live:

```bash
sudo journalctl -u menuland -f
```

Since a specific time:

```bash
sudo journalctl -u menuland --since "1 hour ago" --no-pager
```

Errors only:

```bash
sudo journalctl -u menuland -p err -n 50 --no-pager
```

**Scheduled backups** — these do not go to journalctl:

```bash
cat /var/lib/menuland/logs/backup.log
```

**nginx**:

```bash
sudo tail -n 100 /var/log/nginx/error.log
```

---

## Take a backup

Do this before any update, any migration, and any restore.

```bash
cd /srv/menuland && npm run backup
```

That writes a timestamped `.tar.gz` into `/var/lib/menuland/backups/`
containing every database table and every uploaded image, prunes to the newest
14 archives, and emails the archive if SMTP and a destination address are
configured.

Archive only, no email:

```bash
cd /srv/menuland && npm run backup:dry
```

**The command exits non-zero if the backup failed.** A zero exit with
"not configured" means the archive was written but no email address is set —
the archive is safe on disk. Set the address at `/admin/settings`.

Check it landed:

```bash
ls -lht /var/lib/menuland/backups/ | head
```

---

## Restore a backup

> **This replaces all data.** Every table in the archive is emptied and refilled.
> Take a fresh backup first — even a broken current state is worth keeping until
> you are sure the restore worked.

> Verified end to end on 2026-09-12 against a scratch database: 31 tables,
> 51,918 rows and 109 uploaded files restored with every row count, id, foreign
> key and file hash identical to the source. See
> [Rehearse a restore](#rehearse-a-restore).

### 1. See what the archive contains, without touching anything

The script is a dry run by default. It prints what it would restore and stops.

```bash
cd /srv/menuland && npm run backup:restore -- /var/lib/menuland/backups/ARCHIVE.tar.gz --confirm=menuland
```

Read the output. It shows when the archive was taken, which schema version it
was taken against, the live schema version, and the row count per table.

**If it warns that the schema versions differ, stop.** Restoring a dump whose
columns no longer exist fails halfway and leaves the database empty. Migrate to
the archive's version first.

### 2. Stop the app so nothing writes during the restore

```bash
sudo systemctl stop menuland
```

### 3. Apply it

```bash
cd /srv/menuland && npm run backup:restore -- /var/lib/menuland/backups/ARCHIVE.tar.gz --confirm=menuland --yes
```

`--confirm=<dbname>` is checked against the database `DATABASE_URL` actually
resolves to, before the archive is opened. If they differ the script prints both
names and exits 1 having read and written nothing. Always pass it: it is the
difference between restoring into the scratch database you meant and restoring
over production because the shell still had the wrong connection string.

### 4. Start up and check

```bash
sudo systemctl start menuland && curl -s https://YOUR-DOMAIN/api/health
```

Then open a menu page and the dashboard in a browser and confirm real data is
there.

---

## Rehearse a restore

A backup you have not restored is a hypothesis. Rehearse into a **scratch
database** — never into the live one. These are the exact commands used for the
2026-09-12 rehearsal, run from the application directory.

That rehearsal restored 31 tables, 51,918 rows and 109 uploaded files in 8.3
seconds, and every row count, id set, foreign key and file hash came back
identical to the source. Repeat it after any change to the backup or restore
code, and after any migration that adds a table.

Create the scratch database and give it the current schema:

```bash
psql "$DATABASE_URL" -c 'CREATE DATABASE menuland_restore_rehearsal'
```

```bash
DATABASE_URL="postgresql://USER:PASS@localhost:5432/menuland_restore_rehearsal?schema=public" npx prisma migrate deploy
```

Restore into it. `DATA_DIR` is pointed at a throwaway directory so the archive's
uploads do not overwrite the real ones, and `--confirm` names the scratch
database:

```bash
DATABASE_URL="postgresql://USER:PASS@localhost:5432/menuland_restore_rehearsal?schema=public" DATA_DIR=/tmp/restore-rehearsal npm run backup:restore -- /var/lib/menuland/backups/ARCHIVE.tar.gz --confirm=menuland_restore_rehearsal --yes
```

Check the guard actually protects you — this must refuse, because
`DATABASE_URL` is the live database while `--confirm` names the scratch one:

```bash
npm run backup:restore -- /var/lib/menuland/backups/ARCHIVE.tar.gz --confirm=menuland_restore_rehearsal --yes
```

Compare row counts against the counts the dry run printed from the archive
manifest. `Session` and `RateLimit` are expected to be empty — they are excluded
from the backup on purpose — and `.gitkeep` is expected to be absent from the
restored uploads for the same reason. Everything else must match exactly.

Then drop the scratch database:

```bash
psql "$DATABASE_URL" -c 'DROP DATABASE menuland_restore_rehearsal'
```

> On the Windows development machine the portable PostgreSQL build ships no
> `psql`. Create and drop the scratch database through the project's own `pg`
> driver instead — `node -e` with a `CREATE DATABASE` / `DROP DATABASE` query.

---

## Deploy an update

The folder layout exists to make this safe: the application directory is
replaced wholesale and the customer-data directory is never touched.

```bash
cd /srv/menuland && npm run backup
```

```bash
sudo systemctl stop menuland
```

Preserve the configuration — it is the one file in the app directory that is not
in the repository:

```bash
cp /srv/menuland/.env /tmp/menuland.env
```

Replace the application. **If you deploy from git** (recommended now that the
project is under version control):

```bash
cd /srv/menuland && git fetch && git checkout main && git pull
```

**If you deploy from a tarball** (the original procedure):

```bash
sudo rm -rf /srv/menuland && sudo mkdir -p /srv/menuland && sudo chown menuland:menuland /srv/menuland
```

```bash
sudo -u menuland tar -xzf /tmp/menuland-core-NEW.tar.gz -C /srv/menuland --strip-components=1
```

Either way, put the configuration back and rebuild:

```bash
cp /tmp/menuland.env /srv/menuland/.env && chmod 600 /srv/menuland/.env
```

```bash
cd /srv/menuland && npm ci && npx prisma migrate deploy && npm run build
```

```bash
sudo systemctl start menuland && curl -s https://YOUR-DOMAIN/api/health
```

To stamp the running build with its commit, export `GIT_COMMIT` before
`npm run build` — the health endpoint then reports it:

```bash
export GIT_COMMIT=$(git rev-parse --short HEAD)
```

---

## Roll back to the previous commit

Use this when a deploy made things worse and you want the previous version back.

### If you deploy from git

See what you are on and what came before:

```bash
cd /srv/menuland && git log --oneline -5
```

```bash
sudo systemctl stop menuland
```

Go back one commit:

```bash
cd /srv/menuland && git checkout HEAD~1
```

Or to a specific commit from the list:

```bash
cd /srv/menuland && git checkout COMMIT-HASH
```

Rebuild and start:

```bash
cd /srv/menuland && npm ci && npm run build && sudo systemctl start menuland
```

To return to the latest version afterwards:

```bash
cd /srv/menuland && git checkout main
```

### If you deploy from tarballs

There is no commit to return to on the server. Keep the previous tarball and
re-run the deploy procedure with it. This is the main reason to move to a git
deploy.

### The database is the part that does not roll back

**Code rolls back. Migrations do not.** If the bad deploy ran
`prisma migrate deploy` and added or changed columns, going back to the old code
leaves it running against a newer schema.

Migrations in this project are written to be additive, so old code against a
newer schema usually still works — the extra columns are simply ignored. If it
does not work, restore the backup you took before the deploy:
[Restore a backup](#restore-a-backup).

This is why the deploy procedure starts with `npm run backup`.

---

## Development-only commands

These are for a local machine, **not a server**.

```bash
npm run db:snapshot        # JSON snapshot of the local database
npm run db:snapshot:list   # list them
npm run db:restore FILE    # restore one
```

> `npm run db:reset` **drops the entire database**, re-runs every migration and
> re-seeds. It is a local development command. Never run it on a server.

---

## Before you finish

After any of the procedures above, confirm the app actually works — not just
that the process is running:

```bash
curl -s https://YOUR-DOMAIN/api/health
```

`"status":"ok"` with `"database":true` and `"uploadsWritable":true`.

Then open one guest menu and the dashboard in a browser. A green health check
with a broken page is still a broken page.
