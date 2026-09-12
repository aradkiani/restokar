# منولند — Menuland

Multi-tenant SaaS for restaurant and café digital menus: QR ordering, a live
kitchen board, and sales/profit reporting. Persian (RTL) first, English second.

|               |                                                                  |
| ------------- | ---------------------------------------------------------------- |
| **Framework** | Next.js 16 (App Router), React 19, TypeScript                    |
| **Styling**   | Tailwind CSS 4 (CSS-first config)                                |
| **Data**      | PostgreSQL via Prisma 7 (driver adapter, no query engine binary) |
| **Auth**      | bcrypt + JWT in an httpOnly cookie, backed by revocable sessions |
| **Payments**  | Zarinpal, behind a gateway-agnostic `PaymentProvider` interface  |
| **Real-time** | Server-sent events                                               |

---

## Quick start

Requires **Node.js 20+** and a PostgreSQL 14+ server.

```bash
npm install
```

Start a database — whichever is available. Both bind port **5433** and produce
the same `DATABASE_URL`:

```bash
docker compose up -d
```

```bash
powershell -ExecutionPolicy Bypass -File ./scripts/pg-portable.ps1 install
```

The portable script downloads PostgreSQL binaries into `%LOCALAPPDATA%` and runs
them with no installer and no admin rights. It exists because Docker Desktop on
Windows requires WSL2, which is not always available.

Configure:

```bash
cp .env.example .env
```

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Paste that value into `AUTH_SECRET`, then create the schema and load demo data:

```bash
npx prisma migrate deploy
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Open <http://localhost:3000>.

### Demo accounts

All seeded accounts use the password `password123`.

| Role           | Email                   | Lands on            |
| -------------- | ----------------------- | ------------------- |
| Owner          | `owner@cafe-nabsh.ir`   | `/dashboard`        |
| Owner          | `owner@burger-lab.ir`   | `/dashboard`        |
| Kitchen staff  | `kitchen@cafe-nabsh.ir` | `/dashboard/orders` |
| Platform admin | `admin@menuland.ir`     | `/admin`            |

The seed generates six weeks of orders with lunch/dinner peaks and busier
Thursday–Friday weekends, so analytics and finance have something meaningful to
show immediately.

It also creates four **showcase venues** — `demo-aurora`, `demo-ember`,
`demo-linen`, `demo-noir` — one per template. These carry `isDemo: true` and are
the only restaurants the marketing site is permitted to display.

---

## Scripts

| Command                           | Does                                 |
| --------------------------------- | ------------------------------------ |
| `npm run dev`                     | Development server                   |
| `npm run build`                   | `prisma generate` + production build |
| `npm start`                       | Serve the production build           |
| `npm run verify`                  | typecheck → lint → format check      |
| `npm run typecheck`               | `tsc --noEmit`                       |
| `npm run lint` / `lint:fix`       | ESLint                               |
| `npm run format` / `format:check` | Prettier                             |
| `npm run db:up` / `db:down`       | Start / stop the Postgres container  |
| `npm run db:migrate`              | Create and apply a migration         |
| `npm run db:seed`                 | Load demo data (idempotent)          |
| `npm run db:reset`                | Drop, re-migrate and re-seed         |
| `npm run db:studio`               | Prisma Studio                        |

Run `npm run verify` before pushing.

---

## Project structure

```
prisma/
├── schema.prisma            data model + tenancy notes
├── migrations/              committed, applied with `migrate deploy`
└── seed.ts                  demo tenants, showcase venues, 6 weeks of orders

scripts/
├── audit-palettes.ts        asserts every menu palette passes WCAG AA
└── pg-portable.ps1          no-install PostgreSQL for Windows

src/
├── app/                     routes — the filesystem IS the routing contract
│   ├── (auth)/              login · register
│   ├── admin/               platform console (SUPER_ADMIN only)
│   ├── dashboard/           owner + kitchen area
│   ├── menu/[slug]/         public menu · live order tracking
│   ├── payment/mock/        dev-only stand-in gateway
│   └── api/                 route handlers
├── components/
│   ├── ui/                  design-system primitives (button, card, field…)
│   └── marketing/           landing-page-only pieces
├── lib/
│   ├── auth/                sessions, guards, password hashing
│   ├── i18n/                fa (source of truth) + en dictionaries
│   ├── payments/            PaymentProvider interface + zarinpal/mock drivers
│   ├── constants.ts         cross-cutting values (durations, rate limits…)
│   ├── env.ts               validated environment, fails fast at boot
│   └── validation.ts        shared Zod schemas for API + forms
├── templates/               the menu template system
│   ├── registry.ts          id → component map
│   ├── shared/              cart, product sheet, chrome — used by all four
│   └── aurora | ember | linen | noir/
├── generated/prisma/        Prisma client output — generated, never edited
└── proxy.ts                 edge auth gate (Next 16's "middleware")
```

`src/app/` mirrors the URL structure exactly. Moving a file there changes a
public URL — and `/menu/<slug>` is printed on physical QR codes on restaurant
tables, so those paths are effectively immutable once a venue is live.

---

## Architecture

### Multi-tenancy

One database, one schema, a `restaurantId` discriminator on every tenant-owned
table. The rule that makes it safe: **a tenant id may only come from the
session**, never from a request body, query string, or route param. That is
enforced in one place — `requireTenant()` / `requireOwner()` in
`src/lib/auth/guards.ts` — and every tenant query derives its scope from there.

A route that edits a product filters on both the URL id _and_ the session's
`restaurantId`, so guessing another venue's product id returns 404 rather than
an edit. Guest ordering gets the same treatment: submitted product ids are
looked up scoped to the restaurant, so a cross-tenant order cannot be
constructed.

### The template system

A restaurant row stores exactly two things about its appearance:

- `templateId` — a string key, e.g. `"aurora"`
- `theme` — a small JSON object of colour/font/radius overrides

Nothing else. No copied markup, no per-tenant build, no snapshot.

At render time `src/templates/menu-view.tsx` looks the key up in a registry of
React components and renders whatever the platform currently ships under it.
When a template is improved and deployed, every restaurant on it serves the new
version on its next request — while their own colours and fonts keep applying,
because those are emitted separately as CSS custom properties (`--m-*`).

Templates are deliberately presentational. Cart, product sheet, search, category
rail and checkout live in `src/templates/shared/`, so improving those improves
all four at once. Adding a template is a component plus one registry entry.

### Real-time

The kitchen board and guest order tracking both use **server-sent events** —
one-directional, survives ordinary HTTP infrastructure, and browsers reconnect
on their own, which matters on the mobile connections this runs over.

`src/lib/events.ts` is an in-process pub/sub. **This is correct for a single
Node instance and not for several**: behind more than one instance, a subscriber
on server A won't see an event published on server B. The swap is contained to
that one file — Postgres `LISTEN/NOTIFY` or Redis pub/sub — and no call site
changes. Both consumers also poll, so a dropped event delays an update by
seconds rather than losing it.

The same single-instance caveat applies to `src/lib/rate-limit.ts`.

### Money

Prices are whole **Toman** in `Int` columns — Iranian prices have no minor unit
in practice. Zarinpal expects **Rial**, so the ×10 conversion happens in exactly
one place: `src/lib/payments/zarinpal.ts`.

Orders snapshot the name, price _and_ cost of every line when placed. Editing
the menu afterwards never rewrites history, and profit reporting stays correct
even after a product is deleted.

### Internationalisation

Persian is the source-of-truth dictionary (`src/lib/i18n/fa.ts`); its shape
defines the `Dictionary` type, so English is **compile-time checked for
completeness** — a missing key is a build error, not a blank label.

Locale lives in a cookie rather than the URL, which keeps the public menu at
exactly the address the product promises: `/menu/restaurant-name`.

API routes answer with a stable error `code` plus an untranslated fallback
message; the client renders the localized string. One endpoint therefore serves
a Persian and an English user correctly without knowing which is which.

RTL comes from `dir` on `<html>` plus Tailwind logical properties (`ms-`, `pe-`,
`start-`, `end-`), so both directions work without a mirrored stylesheet.

---

## Code style

`npm run verify` is the gate: **typecheck → lint → format check**.

- **ESLint** (`eslint.config.mjs`) — flat config extending
  `next/core-web-vitals` and `next/typescript`. `no-explicit-any`, `no-console`
  (except `warn`/`error`) and unused variables are errors. `src/generated/` is
  ignored.
- **Prettier** (`.prettierrc.json`) — 90 columns, with
  `prettier-plugin-tailwindcss` sorting class names.
- **Constants** live in `src/lib/constants.ts`. Secrets and per-deployment
  configuration live in `src/lib/env.ts`, which validates at boot and refuses to
  start in production with the example `AUTH_SECRET`.

`react-hooks/set-state-in-effect` is set to **warn**, not error. It fires on
patterns React's own documentation prescribes and this app genuinely needs —
reading `localStorage` after mount, driving a native `<dialog>`, resetting a
draft when a different product is opened. Each remaining site is deliberate and
carries a comment explaining why.

---

## Security notes

- Passwords: bcrypt, 12 rounds. Unknown emails still burn comparable time, so
  login latency doesn't reveal which addresses exist.
- Sessions are database rows; the cookie's JWT carries a session id, so
  revocation and deactivation take effect immediately rather than at token
  expiry. Changing a password signs out every _other_ device.
- Rate limits on login (per address _and_ per account), registration, order
  placement and upload. A successful login resets the counter.
- Uploads are checked against an allow-list by declared MIME type **and** magic
  bytes; filenames are generated, never derived from user input.
- Order status pages are addressed by an unguessable token rather than the order
  id, so they cannot be enumerated.
- The payment callback never trusts the query string about whether money moved —
  it verifies server-to-server and settles idempotently.

---

## Known limitations

- In-process SSE and rate limiting are single-instance (see above).
- Uploads go to local disk. `STORAGE_DRIVER` is the seam for S3-compatible
  object storage; behind several instances, local disk will not do.
- Menu slugs can't be changed from the dashboard by design — a live slug is
  printed on every table's QR code, so changing one is a support operation.
- `CONTACT` in `src/lib/constants.ts` holds placeholder details for the
  marketing site. Replace before launch.

Deployment — VPS, Nginx, systemd, HTTPS, and the Vercel caveats — is covered in
[DEPLOY.md](DEPLOY.md).
