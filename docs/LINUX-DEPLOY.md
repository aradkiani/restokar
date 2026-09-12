# Deploying Menuland on a Linux server

A complete walkthrough, from "I have nothing" to "restaurants are scanning QR
codes". No prior server experience assumed. Every command is meant to be run in
order.

Budget about **60–90 minutes** for the first deployment.

---

## 0. What you are about to build

```
your-server
├── /srv/menuland/            the application   ← replaced on every update
├── /var/lib/menuland/        customer data     ← NEVER replaced
│   ├── uploads/  backups/  snapshots/  logs/
└── PostgreSQL                menus, orders, accounts
```

Two rules follow from this and they are the whole reason the project is laid
out the way it is:

1. Updating the site means replacing `/srv/menuland/`. Nothing else.
2. `/var/lib/menuland/` and the database are the customers'. They survive every
   update, and they are what the twice-daily backup protects.

---

## 1. Choosing a host

### The recommendation: an Iranian VPS

Your customers are Iranian restaurants and your diners are on Iranian mobile
networks, so this is not a close call:

- **Latency.** A guest scans a QR code at a table and waits for the menu. From an
  Iranian datacenter that is tens of milliseconds; from Europe it is hundreds,
  through filtering that varies by hour.
- **Sanctions.** AWS, Google Cloud, Azure, Vercel, DigitalOcean and Hetzner all
  either block Iranian sign-ups or suspend accounts that show Iranian usage. A
  suspended account takes your customers' menus offline with no notice. This is
  the same constraint that already shaped the project — Zarinpal instead of
  Stripe, self-hosted fonts instead of Google Fonts.
- **Payment.** You can pay an Iranian provider with an Iranian card.

**Providers worth looking at** (I cannot verify current prices — check them
yourself):

| Provider                    | Type           | Notes                                                                                                                                        |
| --------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **ابر آروان / ArvanCloud**  | VPS + CDN + S3 | Largest Iranian cloud. Also sells object storage and CDN you may want later. **My pick.**                                                    |
| **پارس‌پک / Parspack**      | VPS + domains  | Cheap, straightforward, and registers `.ir` domains — one supplier for both. Good pick if you want fewer accounts.                           |
| **ایران‌سرور / IranServer** | VPS + domains  | Long-established, good support reputation.                                                                                                   |
| **لیارا / Liara**           | PaaS           | Not a VPS — you push code and it runs it, with managed PostgreSQL. Skip most of this guide. Easiest, least control, more expensive at scale. |

If you would rather not administer a server at all, **Liara** is a legitimate
choice and you can stop reading at section 11 (domain) and follow their docs
instead. Everything below assumes a VPS, which is cheaper and gives you the
backup and nginx setup this project is written for.

### What to buy

For launch, with a handful of restaurants:

| Resource | Minimum              | Comfortable      |
| -------- | -------------------- | ---------------- |
| CPU      | 2 vCPU               | 4 vCPU           |
| RAM      | 4 GB                 | 8 GB             |
| Disk     | 40 GB SSD            | 80 GB SSD        |
| OS       | **Ubuntu 24.04 LTS** | Ubuntu 24.04 LTS |

Measured on this codebase: one Node process saturates at ~240 requests/second
while using 1.3 CPU cores, and the database is nowhere near the bottleneck. 2
vCPU is genuinely enough to start. The figure that grows is **disk**, because
every restaurant uploads photos.

Grow to 8 vCPU / 16 GB when you approach ~100 restaurants with 50 concurrent
diners each.

Choose **Ubuntu 24.04 LTS** when the provider asks for an operating system.

---

## 2. First contact with the server

Your provider gives you an IP address and a root password.

From your own computer (PowerShell on Windows works fine):

```bash
ssh root@YOUR_SERVER_IP
```

Say `yes` to the fingerprint prompt, then enter the password.

Update everything and set the clock to Tehran:

```bash
apt update && apt upgrade -y
```

```bash
timedatectl set-timezone Asia/Tehran
```

Every reporting boundary the application uses — trading days, weeks, months,
opening hours, Jalali report windows and the sales-insight comparison periods —
is derived from `APP_TIME_ZONE` in `src/lib/time.ts`, **not** from the system
clock. The command above is still worth running so log timestamps and anything
an operator reads at the shell match the restaurant's day, but the financial
figures no longer depend on it.

That was not always true: until the production-readiness pass, the daily chart
buckets, the busiest-hours chart and the monthly/quarterly report boundaries all
read the host clock. On a server left at UTC a "March" report covered 32 days and
counted 1 April twice. The regression tests in `analytics.test.ts`,
`report-range.test.ts` and `jalali.test.ts` now assert the boundaries in the
venue's zone, and the whole suite is run under several `TZ` values.

### Create a non-root user

Running a web app as root means any bug in it is a bug with total control of the
machine.

```bash
adduser menuland
```

```bash
usermod -aG sudo menuland
```

### Turn on the firewall

```bash
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

PostgreSQL is deliberately **not** opened. It only ever accepts connections from
the server itself.

---

## 3. Install the runtime

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
```

```bash
sudo apt install -y nodejs postgresql nginx
```

Check Node is version 22 or newer:

```bash
node -v
```

---

## 4. Create the database

```bash
sudo -u postgres psql -c "CREATE USER menuland WITH PASSWORD 'PUT-A-LONG-RANDOM-PASSWORD-HERE';"
```

```bash
sudo -u postgres psql -c "CREATE DATABASE menuland OWNER menuland;"
```

Generate that password rather than inventing one, and keep it — it goes in
`.env` shortly:

```bash
openssl rand -base64 24
```

---

## 5. Create the customer-data directory

This is the folder that must outlive every update.

```bash
sudo mkdir -p /var/lib/menuland/{uploads,backups,snapshots,logs}
```

```bash
sudo chown -R menuland:menuland /var/lib/menuland
```

---

## 6. Upload the application

On **your own computer**, in the folder containing `menuland-core.tar.gz`:

```bash
scp menuland-core.tar.gz menuland@YOUR_SERVER_IP:/tmp/
```

Back on the **server**:

```bash
sudo mkdir -p /srv/menuland && sudo chown menuland:menuland /srv/menuland
```

```bash
sudo -u menuland tar -xzf /tmp/menuland-core.tar.gz -C /srv/menuland --strip-components=1
```

`--strip-components=1` unwraps the `core/` folder inside the archive so the
files land directly in `/srv/menuland`.

Confirm:

```bash
ls /srv/menuland
```

You should see `package.json`, `src`, `prisma`, `public`, `scripts`, `docs`.

---

## 7. Configure

```bash
cd /srv/menuland && cp .env.example .env
```

Generate an auth secret — this signs every login session:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Open the file:

```bash
nano .env
```

Set these. The rest can keep their defaults for now:

```ini
DATABASE_URL="postgresql://menuland:THE-DB-PASSWORD@localhost:5432/menuland?schema=public"
AUTH_SECRET="THE-48-BYTE-VALUE-YOU-JUST-GENERATED"
NEXT_PUBLIC_APP_URL="https://yourdomain.com"
NODE_ENV="production"
DATA_DIR="/var/lib/menuland"
TRUSTED_PROXY_HOPS="1"
```

Save with `Ctrl+O`, `Enter`, then `Ctrl+X`.

> **`NEXT_PUBLIC_APP_URL` is the one setting you cannot get wrong.** Every QR
> code embeds this value at the moment it is generated, and QR codes get printed
> and glued to tables. Set your real domain **before** any restaurant generates
> codes. The app refuses to start in production if this is a `localhost` or
> non-HTTPS address, precisely to stop this mistake.

Lock the file down — it contains your database password and auth secret:

```bash
chmod 600 .env
```

---

## 8. Install, migrate, build

```bash
cd /srv/menuland && npm ci
```

```bash
npx prisma migrate deploy
```

`migrate deploy` only applies existing migrations. It never prompts and never
drops data — unlike `migrate dev`, which you must not run on a live server.

```bash
npm run build
```

---

## 9. Keep it running

Create the service:

```bash
sudo nano /etc/systemd/system/menuland.service
```

```ini
[Unit]
Description=Menuland
After=network.target postgresql.service

[Service]
Type=simple
User=menuland
WorkingDirectory=/srv/menuland
EnvironmentFile=/srv/menuland/.env
Environment=NODE_ENV=production
Environment=TZ=Asia/Tehran
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now menuland
```

Check it started:

```bash
sudo systemctl status menuland
```

If it failed, read why:

```bash
sudo journalctl -u menuland -n 50 --no-pager
```

---

## 10. Put nginx in front

```bash
sudo nano /etc/nginx/sites-available/menuland
```

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    client_max_body_size 10M;      # product image uploads

    # Customer photos, served straight off disk. The app can serve these itself,
    # but nginx does it without waking Node. The /uploads/ path is stored in the
    # database on every product and logo — do not change it.
    location /uploads/ {
        alias /var/lib/menuland/uploads/;
        access_log off;
        expires 1y;
        add_header Cache-Control "public, immutable";
        add_header X-Content-Type-Options "nosniff";
        try_files $uri =404;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # The kitchen board and live order tracking are server-sent events.
        # Without these three lines orders stop appearing in real time.
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
    }
}
```

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/menuland /etc/nginx/sites-enabled/
```

```bash
sudo rm -f /etc/nginx/sites-enabled/default
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## 11. Connect your domain

### Buying one

A **`.ir`** domain is the sensible choice for an Iranian product: it is cheap
(a few hundred thousand rial a year), registered through IRNIC, and any Iranian
provider — **Parspack**, **IranServer**, **ArvanCloud** — will sell you one with
an Iranian card. A `.com` is possible but paying an international registrar from
Iran is the hard part.

Buying the domain from the same company as your server means one control panel
instead of two.

### Pointing it at the server

In your registrar's DNS panel, create two records:

| Type | Name (Host) | Value            | TTL  |
| ---- | ----------- | ---------------- | ---- |
| A    | `@`         | `YOUR_SERVER_IP` | 3600 |
| A    | `www`       | `YOUR_SERVER_IP` | 3600 |

`@` means the bare domain (`yourdomain.com`); `www` covers
`www.yourdomain.com`.

DNS takes anywhere from a few minutes to a few hours to spread. Check from your
own computer:

```bash
nslookup yourdomain.com
```

When it answers with your server's IP, continue. **Do not run the next step
before this works** — the certificate authority has to reach your domain to
issue a certificate.

### HTTPS

```bash
sudo apt install -y certbot python3-certbot-nginx
```

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Answer the email prompt, accept the terms, and choose **redirect** when asked
whether to force HTTPS.

HTTPS is not optional here: session cookies are issued with the `Secure` flag in
production, so logins simply will not persist over plain HTTP.

Certbot installs a renewal timer automatically. Confirm it:

```bash
sudo systemctl list-timers | grep certbot
```

Your site is now live at `https://yourdomain.com`.

---

## 12. Create your admin account

The demo seed is sample data — **do not run it on a production server**. Instead
register normally, then promote yourself.

Temporarily allow registration:

```bash
cd /srv/menuland && echo 'ENABLE_PUBLIC_REGISTRATION="true"' >> .env && sudo systemctl restart menuland
```

Visit `https://yourdomain.com/register` and sign up with your own email and a
strong password.

Promote that account to platform admin:

```bash
sudo -u postgres psql -d menuland -c "UPDATE \"User\" SET role='SUPER_ADMIN', \"restaurantId\"=NULL WHERE email='you@yourdomain.com';"
```

Then close registration again — customers are onboarded from the admin console:

```bash
cd /srv/menuland && sed -i '/ENABLE_PUBLIC_REGISTRATION/d' .env && sudo systemctl restart menuland
```

Sign in at `https://yourdomain.com/login`. You should land on `/admin`, where
`Create customer account` onboards restaurants.

---

## 13. Turn on backups

Every 12 hours the whole of the customers' data — all 20 database tables plus
every uploaded photo — is archived and emailed to you.

### Mail credentials

Any mailbox you already own works. There is no paid service involved.

```bash
cd /srv/menuland && nano .env
```

```ini
SMTP_HOST="smtp.yourprovider.com"
SMTP_PORT="587"
SMTP_USER="backups@yourdomain.com"
SMTP_PASSWORD="the-mailbox-password"
SMTP_FROM="backups@yourdomain.com"
SMTP_SECURE="false"
```

### The delivery address

Set it in the admin console at **`https://yourdomain.com/admin/settings`**, not
in a file — so you can change where backups land later without touching the
server.

### The schedule

```bash
sudo nano /etc/systemd/system/menuland-backup.service
```

```ini
[Unit]
Description=Menuland customer-data backup
After=network-online.target postgresql.service

[Service]
Type=oneshot
User=menuland
WorkingDirectory=/srv/menuland
EnvironmentFile=/srv/menuland/.env
Environment=TZ=Asia/Tehran
ExecStart=/usr/bin/npm run backup
StandardOutput=append:/var/lib/menuland/logs/backup.log
StandardError=append:/var/lib/menuland/logs/backup.log
```

```bash
sudo nano /etc/systemd/system/menuland-backup.timer
```

```ini
[Unit]
Description=Run the Menuland backup every 12 hours

[Timer]
OnCalendar=*-*-* 03,15:00:00
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now menuland-backup.timer
```

**Test it immediately** — a backup you have never seen run is not a backup:

```bash
sudo systemctl start menuland-backup.service && sudo journalctl -u menuland-backup -n 30 --no-pager
```

Check your inbox. Then check the admin console at `/admin/settings`, which shows
the outcome of the last run and the error text if it failed.

---

## 14. Updating the site later

This is the procedure the whole folder layout exists to make safe.

```bash
cd /srv/menuland && npm run backup
```

```bash
sudo systemctl stop menuland
```

Keep your configuration, then replace the application:

```bash
cp /srv/menuland/.env /tmp/menuland.env
```

```bash
sudo rm -rf /srv/menuland && sudo mkdir -p /srv/menuland && sudo chown menuland:menuland /srv/menuland
```

```bash
sudo -u menuland tar -xzf /tmp/menuland-core-NEW.tar.gz -C /srv/menuland --strip-components=1
```

```bash
cp /tmp/menuland.env /srv/menuland/.env && chmod 600 /srv/menuland/.env
```

```bash
cd /srv/menuland && npm ci && npx prisma migrate deploy && npm run build
```

```bash
sudo systemctl start menuland
```

`/var/lib/menuland/` was never mentioned, and the database was never dropped.
That is the point.

---

## 15. When something is wrong

| Symptom            | Command                                            |
| ------------------ | -------------------------------------------------- |
| Site is down       | `sudo systemctl status menuland`                   |
| Why did it crash   | `sudo journalctl -u menuland -n 100 --no-pager`    |
| nginx complains    | `sudo nginx -t`                                    |
| Database reachable | `sudo -u postgres psql -d menuland -c "\dt"`       |
| Backup failed      | `cat /var/lib/menuland/logs/backup.log`            |
| Disk filling up    | `df -h` then `du -sh /var/lib/menuland/*`          |
| Restart everything | `sudo systemctl restart menuland nginx postgresql` |

**"It won't start in production"** is usually deliberate. The app refuses to boot
when `AUTH_SECRET` is still the example value, when `NEXT_PUBLIC_APP_URL` is a
localhost or non-HTTPS address, or when `PAYMENT_PROVIDER="zarinpal"` has no
merchant id. The error message names the variable.

**Orders not appearing live on the kitchen board** means nginx is buffering the
event stream — check that `proxy_buffering off;` is present in the config.

---

## 15b. What is built but not wired up

Read this before promising anything to a restaurant. Everything below is
deliberate; none of it is broken.

**Campaigns — planning only, nothing is ever sent.** The Campaigns screen lets an
owner name an audience, pick a customer segment and an optional dish or
category, set a window and move the campaign through its states. There is **no
SMS provider, no email sender and no push service**, and no code path in the
application makes an outbound call for a campaign. The screen says so in Persian
at the top, and the delivery figures render as "not available" rather than as
zeros. Adding a gateway later is a separate piece of work; the consent
(`Customer.marketingConsent`) and the audience arithmetic are already recorded so
it will not need backfilling.

**Customer records need phone numbers to exist.** A guest is only recognised when
they type a phone number at checkout, which has never been required. Until real
orders carry one, the Customers screen and the campaign audience counts are
legitimately empty, and the customer-behaviour sales insight stays silent. The
demo seed does not set phone numbers, so this is also true of a seeded database.

**Payments are off by default and mocked.** `PAYMENT_PROVIDER="mock"` runs the
full redirect and callback with no network call and no money movement. Guest
payments (`ENABLE_PAYMENTS`) and venue subscription checkout
(`ENABLE_SUBSCRIPTION_CHECKOUT`) are separate switches on purpose — demonstrating
one must not silently enable the other. Zarinpal is the only provider behind the
interface; nothing reaches a blocked network.

**Backups are an archive plus optional SMTP.** `npm run backup` writes to
`$DATA_DIR/backups` and mails it if SMTP is configured. Restore is the manual
`npm run backup:restore -- <archive>` command. There is no scheduled off-site
replication and no automated restore verification — rehearse a restore yourself
before relying on it, as the checklist below requires.

**Known operational gaps.** Images are served at full size with no `srcset`, so a
menu scan costs more bandwidth than it needs to. The plan's `maxDailyViews` is
displayed but not enforced. Stock is allowed to go negative rather than blocking
a real sale. The kitchen board polls every 30 seconds in addition to its live
connection. Merchandising conversion rates mix guest sessions with order lines
and are capped at 100%, with the raw counts shown beside them. None of these
blocks a launch; all of them are worth revisiting once real traffic exists.

## 16. Before you tell restaurants about it

- [ ] `https://yourdomain.com` loads with a padlock
- [ ] `NEXT_PUBLIC_APP_URL` is the real domain — **before any QR code is printed**
- [ ] No `password123` account exists anywhere
- [ ] `DATA_DIR=/var/lib/menuland` and it is outside `/srv/menuland`
- [ ] One backup has arrived in your inbox
- [ ] One restore has been rehearsed: `npm run backup:restore -- <archive>`
- [ ] `timedatectl` shows `Asia/Tehran`
- [ ] Demo seed was **not** run
- [ ] Payments: leave off until Zarinpal is live, then set `ENABLE_PAYMENTS="true"`,
      `PAYMENT_PROVIDER="zarinpal"`, a real `ZARINPAL_MERCHANT_ID`, and
      `ZARINPAL_SANDBOX="false"` — and test one real transaction

Related: [DATA-BOUNDARY.md](DATA-BOUNDARY.md) · [BACKUPS.md](BACKUPS.md)
