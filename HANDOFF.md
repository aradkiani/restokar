# Handoff — Menuland

Everything a new session needs to continue this project. Read this first, then
[README.md](README.md) for architecture and [DEPLOY.md](DEPLOY.md) for hosting.

**This file supersedes every earlier handoff.** Sections marked
_(new)_ did not exist in the previous one and are where an older set of notes
will mislead you.

---

## What this is

A multi-tenant SaaS for Iranian restaurants and cafés: digital menus with QR
ordering, a live order board, sales analytics, financial reporting, and a
platform admin console. **Persian (RTL) first**, English second.

**Status: working locally, never deployed.** No real users, no production data,
no live payments. That matters — destructive operations are cheap and
`npm run db:reset` is safe.

---

## Stack

|           |                                                                             |
| --------- | --------------------------------------------------------------------------- |
| Framework | Next.js 16 (App Router), React 19, TypeScript (strict)                      |
| Styling   | Tailwind CSS 4 — CSS-first config in `src/app/globals.css`                  |
| Database  | PostgreSQL 16 via Prisma 7 (driver adapter, no query-engine binary)         |
| Auth      | bcrypt + JWT in an httpOnly cookie, backed by revocable DB sessions         |
| Payments  | Zarinpal behind a `PaymentProvider` interface (currently the `mock` driver) |
| Real-time | Server-sent events                                                          |
| Tests     | Vitest — **166 unit tests across 12 files**                                 |
| Tooling   | ESLint (flat config) + Prettier, gated by `npm run verify`                  |

**No UI component library.** Everything in `src/components/ui/` is hand-built.
Match those primitives rather than introducing shadcn/MUI.

`npm run verify` is currently **green**. Keep it that way.

---

## Getting it running

Requires **Node 20+**. From the project root:

```bash
npm install
```

Start PostgreSQL. The portable script needs no Docker and no admin rights, and
is what this project is actually developed against:

```bash
powershell -ExecutionPolicy Bypass -File ./scripts/pg-portable.ps1 start
```

First time on a new machine use `install` instead of `start` — it downloads
PostgreSQL binaries into `%LOCALAPPDATA%\menuland-pg` (~22MB).

**`.env` is deliberately NOT in this bundle** (secrets do not travel in a
handoff). Recreate it:

```bash
cp .env.example .env
```

Then generate a secret and paste it into `AUTH_SECRET` — the app refuses to boot
without a real one:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

```bash
npx prisma migrate deploy && npx prisma generate && npm run db:seed && npm run db:seed:tenants
```

```bash
npm run dev
```

Open <http://localhost:3000>.

### Two operational traps that cost real debugging time

1. **Restart the dev server after `prisma generate`.** The running Node process
   caches the old client and keeps returning
   `Unknown field 'x' for select statement on model 'Y'` with a 500 — while
   `tsc --noEmit` passes, because typecheck reads the regenerated client from
   disk. That mismatch makes it look like a code bug. It is not.
2. **The portable Postgres gets killed often.** `ECONNREFUSED` almost always
   means "restart it", not a code fault.

### Accounts (all password `password123`)

| Role           | Email                              | Template         |
| -------------- | ---------------------------------- | ---------------- |
| Platform admin | `admin@menuland.ir`                | → /admin         |
| Owner          | `sara@kafe-shabaneh.ir`            | aurora           |
| Owner          | `amir@burger-khaneh.ir`            | ember            |
| Owner          | `hossein@sofreh-golestan.ir`       | linen            |
| Owner          | `negar@restoran-darvish.ir`        | noir             |
| Demo owners    | `demo@demo-<template>.menuland.ir` | one per template |

The four owner accounts each carry ~92 days of trading history (≈9,000 orders),
so analytics, finance and reports all have real data.

**Two hand-registered accounts** (`arad.kia688@gmail.com`, `aradkwork@gmail.com`)
own `سنتی-حشمت` and `pizzaking`. Their passwords were set by hand and are **not**
`password123`. `npm run db:seed:sandbox` gives them a menu and ~7 days of recent
orders including today's.

**Demo data note:** the six demo venues have `bilingualEnabled = true`, the
Ember demo's «پیتزا پپرونی» carries two option groups, and a few sample orders
sit on `demo-ember` so the board and dashboard are not empty. All of it is
disposable.

---

## Commands

| Command                       | Does                                                                 |
| ----------------------------- | -------------------------------------------------------------------- |
| `npm run verify`              | **typecheck → lint → format → tests.** Run before finishing any task |
| `npm run dev`                 | Dev server                                                           |
| `npm run build`               | `prisma generate` + production build                                 |
| `npm test`                    | Vitest once                                                          |
| `npm run db:seed`             | Plans, admin, 2 test tenants, **6 demo venues** (idempotent)         |
| `npm run db:seed:tenants`     | The 4 template-test accounts with 3 months of data                   |
| `npm run db:seed:sandbox`     | Menu + a recent week of orders for the hand-made accounts            |
| `npm run db:snapshot [label]` | JSON snapshot of every table → `.snapshots/`                         |
| `npm run db:restore <file>`   | Restore a snapshot                                                   |
| `npm run db:reset`            | Drop, re-migrate, re-seed                                            |

**Take a snapshot before any migration.** The portable Postgres build has no
`pg_dump`, which is why `scripts/db-snapshot.ts` exists.

---

## Architecture — the parts that matter

### Tenant isolation (the most important rule)

One database, one schema, `restaurantId` on every tenant-owned table.

**A tenant id may only come from the session — never from a request body, query
string, or route param.** Enforced in `src/lib/auth/guards.ts`:

- `requireTenant()` — any member of the restaurant
- `requireOwner()` — owner only (finance, settings, reports)
- `requireAdmin()` — SUPER_ADMIN only (platform console)

A route editing a product filters on the URL id **and** the session's
`restaurantId`, so guessing another venue's id returns 404, not an edit.

### Two reporting layers — don't mix them

- `src/lib/analytics.ts` — **scoped to one restaurant.** Safe for owners.
- `src/lib/admin.ts` — **reads across all tenants.** Only behind `requireAdmin()`.

**Revenue is net of tax and tips.** `netRevenue()` subtracts both from `total`:
collected tax belongs to the government and tips to staff.

**Per-request query memoisation:** `loadOrders` / `loadOrderItems` are wrapped in
React's `cache()`, keyed on epoch milliseconds (not `Date` objects — `cache()`
compares by identity). Don't unwrap them.

### Templates — six of them

A restaurant stores only `templateId` (a string key) and `theme` (a small JSON of
colour/font overrides). `src/templates/registry.ts` maps the key to a component
at render time.

| id       | Character                                 |
| -------- | ----------------------------------------- |
| `aurora` | bright, glassy café                       |
| `noir`   | dark fine-dining                          |
| `ember`  | warm, large cards, fast food              |
| `linen`  | printed typographic list, traditional     |
| `bazaar` | two-column market grid **+ سوغاتی shelf** |
| `atlas`  | Swiss numbered grid, high contrast        |

Shared behaviour — cart, product sheet, search, category rail, staff-call button,
**footer**, **language toggle** — lives in `src/templates/shared/`. Fix it there
and all six get it.

**Templates are presentational and must stay that way.** Two rules exist because
they were broken before:

- **Localisation happens once**, in `MenuView` via
  `src/templates/shared/localize.ts`. Templates render `product.name` and get the
  right language by construction. Aurora and Ember once did their own per-field
  ternaries and silently never translated product names — do not reintroduce
  that pattern.
- **Adding to the cart goes through `useAddToCart()`** in `shared/runtime.tsx`,
  which opens the product sheet when a dish has a required option group. Calling
  `cart.add()` straight from a card bypasses the choice and the server rejects
  the order at checkout.

### Money

Whole **Toman** in `Int` columns. Zarinpal wants Rial, so the ×10 conversion
happens in exactly one place: `src/lib/payments/zarinpal.ts`.

**Pricing options** (`src/lib/pricing.ts`) apply in a fixed order:

```
subtotal → −discount → +service charge → +tax (on the service-inclusive base)
        → rounding → +tip (never taxed, never rounded away)
```

Every amount is snapshotted onto the order, because settings change and an old
order must still add up to what the guest paid. All options default OFF.

### Product options / add-ons _(new)_

`ProductOptionGroup` → `ProductOptionChoice`, both per-product. Guests choose
before ordering; the choice changes the line price.

The rules that matter, all covered by `src/lib/order-options.test.ts`:

- **The client sends choice ids only, never prices.** `resolveLineOptions()` in
  `src/lib/orders.ts` looks up what each choice costs, and rejects a choice that
  belongs to another product, a sold-out choice, a skipped required group, or
  more picks than `maxSelect` allows.
- **Deltas are folded into the line's unit price**, so every existing consumer
  (analytics, finance, P&L, the board) keeps totalling correctly without knowing
  options exist.
- **Chosen options are snapshotted by name** onto `OrderItemOption`. Renaming or
  deleting an option never rewrites a past order.
- `costDelta` exists in the schema but **the owner UI no longer collects it** (a
  deliberate simplification — one price box per choice). It is therefore always
  0, so a paid option currently reports 100% margin on that increment. Worth
  revisiting if per-option profit ever matters.

### Bilingual menus _(new)_

Persian + English only, column-based (`nameEn`, `shortDescriptionEn`, …) to
match the pre-existing `nameEn` convention.

**The locale of a menu is not the locale of the panel.** They were one cookie,
and that was a real bug: an owner's dashboard language silently overrode what
their customers saw. Now:

- `src/lib/i18n/menu-locale.ts` — `resolveMenuLocale()` decides a menu's
  language: `?lang=` → the guest's per-venue cookie → the venue's
  `defaultLocale`. A venue that has not enabled a second language always renders
  its own choice, and neither a cookie nor `?lang=` can override the owner.
- The guest's choice lives in a cookie scoped to `path=/menu/<slug>`, so it
  never leaks to another venue or to the dashboard.
- Missing English **always falls back to Persian** (`src/lib/i18n/content.ts`).

`src/lib/i18n/fa.ts` remains the source of truth — its shape defines the
`Dictionary` type, so a missing English key is a compile error.

### Panel appearance (light/dark) _(new)_

Dark mode covers **the dashboard and admin console only**. The marketing site,
pricing, login and every public menu stay light — the storefront is not the
operator's workspace.

- `data-theme` is rendered on the **dashboard/admin wrapper**, never on `<html>`.
  That placement is the entire mechanism confining the theme.
- Implemented by re-pointing the ink scale in `globals.css` rather than adding
  `dark:` to sixty components.
- **`--color-ink-950` and `--color-sidebar` are deliberately not inverted.**
  Every use of ink-950 wants a near-black (sidebar, modal backdrops, text on a
  saffron chip); inverting it turned the sidebar pure white.
- The printable financial report is pinned to the light palette in both themes —
  it is a preview of a page that prints white.

### Fonts _(new)_

Four self-hosted families in `public/fonts`, all SIL OFL: **Vazirmatn, Estedad,
Sahel, Samim**. See `public/fonts/README.md` for versions and sources.

Only Vazirmatn is preloaded; the rest are declared with `@font-face` and a
browser fetches a face only when something uses it. `src/lib/fonts.test.ts` reads
the real stylesheet and `public/` directory, so adding a font to `FONT_OPTIONS`
without shipping its file fails the suite — Estedad shipped broken that way once.

### Errors and i18n

API routes return a stable `code` plus an untranslated fallback; the **client**
renders the localized string via `src/lib/api-error.ts`.

### Real-time

SSE via `src/lib/events.ts`, an in-process pub/sub. Events: `created`,
`updated`, `staff-called`. **Single-instance only.** Both consumers also poll, so
events degrade to seconds rather than being lost. Swapping in Postgres
`LISTEN/NOTIFY` touches only that one file. Same caveat for
`src/lib/rate-limit.ts`.

---

## Layout

```
prisma/
├── schema.prisma          data model
├── migrations/            9 migrations, all additive
├── seed.ts                plans, admin, test tenants, 6 demo venues
├── seed-tenants.ts        4 template-test accounts, 3 months of trade
├── seed-sandbox.ts        recent orders for the hand-registered accounts
└── menu-data.ts           shared menu content, incl. SOUVENIR_MENU

src/
├── app/                   routes — the filesystem IS the URL contract
│   ├── (auth)/            login · register
│   ├── admin/             platform console
│   ├── dashboard/         owner dashboard (orders board lives here)
│   │   ├── options/         tax · service · tip · rounding · staff call · language
│   │   └── finance/report/  printable financial report
│   ├── menu/[slug]/       public menu · live order tracking
│   └── api/               route handlers
├── components/ui/         hand-built primitives — reuse these
├── lib/                   analytics, pricing, jalali, reports, auth, i18n…
├── templates/             registry + shared/ + the six templates
└── proxy.ts               edge auth gate (Next 16's "middleware")
```

**Do not move anything under `src/app/`.** It defines public URLs, and
`/menu/<slug>` gets printed on physical QR codes.

---

## Conventions

- Run `npm run verify` before declaring anything done.
- Prefer extending an existing function over adding a parallel one.
- Constants in `src/lib/constants.ts`; secrets in `src/lib/env.ts`.
- All user-facing strings go through `src/lib/i18n/`. No hardcoded Persian in
  components — `aria-label` and `placeholder` included.
- RTL uses logical properties (`ms-`, `pe-`, `start-`, `end-`). No `left`/`right`
  — **except** where the geometry is genuinely physical (see the RTL notes).
- Touch targets ≥44px — use the `tap-safe` utility.
- Persian numerals: `formatNumber`/`formatMoney` for quantities, `formatYear` for
  years, `localizeDigits` for strings where the separator is part of the label
  (`۰۹:۰۰`) or the value is free text (table numbers, which may be "A1").
- Migrations must be additive. Snapshot first.

### RTL lessons that cost real debugging time

1. **`text-anchor="end"` in an RTL SVG anchors on the opposite side.** Charts now
   set `direction: ltr` on the `<svg>`.
2. **`inset-inline-start` over LTR coordinates mirrors.** Use physical `left`
   when the offset was computed in a physical space.
3. **Adjacent numbers merge.** Wrap each in `<bdi>` with a real layout gap.
4. **A `dir="ltr"` input inside an RTL wrapper puts padding and icon on opposite
   sides.** Set `dir="ltr"` on the wrapper too.
5. **Persian compact notation has no short form** — `۲۰ میلیون`, not `20M`.
6. **`fa-IR` already defaults to the Persian calendar** in `Intl`. Don't
   hand-roll Jalali conversion; `src/lib/jalali.ts` delegates to ICU.

### One deliberate exception

`react-hooks/set-state-in-effect` is set to **warn** (10 warnings). It fires on
patterns React's own docs prescribe. Each site is commented. Don't "fix" these,
and don't add an eleventh without a comment justifying it.

---

## Feature status

**Built and working:** menu CRUD · availability toggle · **6 RTL templates** ·
souvenir shelf · **shared footer with menu sections** · static QR + shareable
link + Open Graph · guest ordering with server-side price validation ·
**product option groups / add-ons** · tax / service / tip / rounding / minimum
order · staff-call button · order states + order board + SSE ·
**tap-to-mark-paid with unpaid sorted first** · **staff-recorded tips** ·
dashboard with **peak hours, menu health and week-on-week deltas** · analytics ·
finance (cost, profit, expenses, P&L) · **editable expenses** · financial report
with worked figures, written recommendations and **standing explanatory text** ·
Jalali period picker · **bilingual menus (fa/en)** · **light/dark panel** ·
**four self-hosted fonts** · subscriptions + plan limits · Zarinpal driver ·
admin console · audit log · tenant isolation · RBAC · rate limiting · upload
validation.

**Not built** (rough priority order):

1. **Barcode PDF sheets** — A5 with 6 codes per page, A4 with 8. Needs no schema
   change and reuses the existing QR + browser-print approach.
2. **Bulk price editor** — high value for repricing under inflation
3. **Drag-and-drop reorder** — `sortOrder` exists in the DB; no UI
4. **PWA** — no manifest, service worker, or push
5. **Audit log viewer** — data is recorded, no screen
6. CSV export · discount codes · loyalty · stock counts · multi-branch

**Deliberately excluded:** native apps, delivery logistics, KDS hardware,
ingredient inventory, AI features, public menu marketplace.

---

## Known issues and constraints

- **THERE IS NO GIT REPOSITORY.** Still the single biggest risk: ~177 source
  files, 9 migrations and 166 tests with no history and no rollback beyond the
  JSON snapshots in `.snapshots/`. Run `git init` early.
- **The category rail's scroll-spy could not be verified end to end** in the
  agent preview pane: a hidden pane does not composite, so programmatic scrolls
  dispatch no scroll events and no IntersectionObserver callbacks. The
  _decision rule_ was verified correct at every position (top, each section,
  bottom, back to top). Confirm the wiring in a real browser.
- **Option `costDelta` is always 0** — see the add-ons section above.
- **PDF is browser-generated, not server-generated.** Deliberate: pdfkit/jsPDF
  have no Persian glyph shaping, and Puppeteer needs a ~170MB Chromium that is
  unreliable to fetch from Iran.
- **`startOfDay` uses the Node process timezone.** Fix is `TZ=Asia/Tehran` on the
  host, not code.
- **The kitchen board polls every 30s even when SSE is healthy.** Fixing it
  properly means promoting the SSE heartbeat to a named event.
- SSE and rate limiting are single-instance.
- Uploads go to local disk; `STORAGE_DRIVER` is the seam for S3.
- **Uploaded images are not resized.** A 4MB phone photo is served as-is.
- Admin restaurant list has no pagination — fine at ~14.

### Sanctions constraints (these shaped real decisions)

No Stripe/PayPal, no AWS/GCP/Azure, no Google Maps, no Twilio. Use **Zarinpal**
for payments, **Kavenegar/Melipayamak** if SMS is ever needed, **Neshan** for
maps. Self-host assets — this is why all four fonts live in `public/fonts`.
Don't introduce a dependency that fetches from a blocked CDN at runtime or build
time.

---

## Before deploying

1. **`NEXT_PUBLIC_APP_URL` → your real `https://` domain.** The app now
   **refuses to boot in production** with a localhost or non-HTTPS origin, and
   the QR screen shows a red warning while the address is local. Both exist
   because the origin is baked into every QR code at generation time — a code
   printed against `localhost` is landfill and cannot be fixed remotely.
2. Fresh `AUTH_SECRET`.
3. `PAYMENT_PROVIDER=zarinpal` + real `ZARINPAL_MERCHANT_ID` + `ZARINPAL_SANDBOX=false`.
4. `NODE_ENV=production`, HTTPS, and `TZ=Asia/Tehran`.
5. Don't run the demo seeds; register your admin normally, then promote it.
6. Nginx needs `proxy_buffering off` or SSE breaks. Full config in DEPLOY.md.
