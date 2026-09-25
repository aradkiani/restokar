# Backups

Every 12 hours, all customer data is archived and emailed to an address set in
the admin console.

## What is backed up

A single `restokar-backup-<timestamp>.tar.gz` containing:

```
manifest.json                 what was taken, when, and against which migration
database/<Table>.json         every row of every table (chunked at 5,000 rows)
uploads/<restaurantId>/…      every customer-uploaded image
```

All 20 customer-data tables are included. The list is **checked against the live
schema on every run** — if a migration adds a table that nobody added to
`TABLE_ORDER` in `src/lib/backup/export.ts`, the backup fails loudly rather than
silently omitting it. That check exists because the previous tool
(`scripts/db-snapshot.ts`) had drifted to 14 tables and quietly skipped six,
including the audit log and all product add-ons.

Three tables are deliberately excluded: `Session` (live auth state, expires on
its own, and session identifiers should not travel by email), `RateLimit`
(counters that are meaningless minutes later) and `_prisma_migrations` (schema,
which returns with the code).

> **The archive contains customer records and bcrypt password hashes.** Treat
> the destination mailbox as a sensitive system.

## Setting it up

### 1. SMTP credentials (environment)

Plain SMTP — any mailbox works, no API key, no paid service.

```bash
SMTP_HOST="smtp.example.com"
SMTP_PORT="587"
SMTP_USER="backups@example.com"
SMTP_PASSWORD="…"
SMTP_FROM="backups@example.com"
SMTP_SECURE="false"   # "true" for implicit TLS on port 465
```

With `SMTP_SECURE=false` the connection starts plaintext and **requires**
STARTTLS — it will not silently fall back to sending in the clear.

### 2. Destination address (admin console)

**`/admin/settings`** → "Backup delivery address".

Deliberately not an environment variable: it has to be changeable without a
redeploy. Leaving it empty disables delivery; archives are still written to
disk. The same page shows the outcome of the last run, including the error text
when one failed.

### 3. The schedule

**Windows**

```bash
powershell -ExecutionPolicy Bypass -File ./scripts/install-backup-schedule.ps1
```

**Linux (systemd)** — `/etc/systemd/system/restokar-backup.service`:

```ini
[Unit]
Description=Restokar customer-data backup
After=network-online.target postgresql.service

[Service]
Type=oneshot
User=restokar
WorkingDirectory=/srv/restokar
EnvironmentFile=/srv/restokar/.env
ExecStart=/usr/bin/npm run backup
StandardOutput=append:/var/lib/restokar/logs/backup.log
StandardError=append:/var/lib/restokar/logs/backup.log
```

`/etc/systemd/system/restokar-backup.timer`:

```ini
[Unit]
Description=Run the Restokar backup every 12 hours

[Timer]
OnCalendar=*-*-* 03,15:00:00
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl enable --now restokar-backup.timer
```

`Persistent=true` matters: it runs a missed backup after the machine comes back
up rather than skipping the window.

## Running it by hand

```bash
npm run backup
```

```bash
npm run backup:dry
```

`--dry` builds the archive and skips delivery — the quickest way to confirm the
export works before wiring up mail.

## When delivery fails

Nothing fails silently. Every run:

- writes the archive to `$DATA_DIR/backups/` **first**, and keeps it whether or
  not the email succeeds — a backup that only exists if the mail server
  cooperated is not a backup;
- records the outcome to `PlatformSetting`, shown at `/admin/settings`;
- logs to stdout, captured by the scheduler's log file;
- exits non-zero, so Task Scheduler shows a failed "Last Run Result" and
  systemd marks the unit failed.

Four outcomes are distinguished: `ok`, `failed` (SMTP error, or SMTP not
configured), `not_configured` (no address set — a warning, not a failure) and
`too_large`.

Archives above **15 MB** are not attached; a message is sent naming the file and
its path on the server instead. For scale: 17.5 MB of rows compress to about
1.3 MB, so there is a lot of headroom, but the order tables grow without bound
and the run needs to behave predictably on the day it stops fitting.

## Retention

The 14 most recent archives are kept locally — a week at twelve-hourly — and
older ones deleted. Unbounded growth would eventually fill the disk and take the
site down, which is worse than a shorter local history. Emailed copies are not
affected.

The same run also prunes expired sessions and stale rate-limit counters.

## Restoring

```bash
npm run backup:restore -- data/backups/restokar-backup-….tar.gz
```

Reports what it would do and changes nothing. To actually apply it:

```bash
npm run backup:restore -- data/backups/restokar-backup-….tar.gz --yes
```

**This truncates and refills every table in the archive.** It warns when the
archive's schema migration does not match the database's — restore into a
matching schema (`npx prisma migrate deploy`) or expect column errors.

Rehearse this before you need it. A backup that has never been restored is a
guess.
