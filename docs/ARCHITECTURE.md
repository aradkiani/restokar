# Architecture

A developer's map of Restokar. Read this once, then use it to find things.

The code carries its own explanations — most modules open with a comment saying
why they exist. This file covers only what you cannot learn from one file at a
time: how the pieces fit, and where to go to change something.

---

## Stack

|            |                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------- |
| Framework  | Next.js 16, App Router, Turbopack                                                            |
| UI         | React 19, TypeScript strict, Tailwind CSS 4 (CSS-first, configured in `src/app/globals.css`) |
| Database   | PostgreSQL 16 via Prisma 7 with the `pg` driver adapter                                      |
| Auth       | Phone + one-time SMS code; a JWT in an httpOnly cookie, backed by revocable `Session` rows   |
| Validation | Zod 4, shared between API routes and forms                                                   |
| Tests      | Vitest                                                                                       |

**No UI component library, no state library, no chart library, no spreadsheet
library.** Charts are hand-drawn SVG in `src/components/charts.tsx`; Excel
files are written by `src/lib/export/xlsx.ts` (a zip of XML over Node's `zlib`)
and CSV by `src/lib/export/csv.ts`. This is deliberate — see "Constraints".

---

## Folder map

```
src/
├── app/                 Routes. Next.js App Router.
│   ├── (auth)/          Login, register
│   ├── admin/           Platform admin console (SUPER_ADMIN only)
│   ├── api/             Route handlers — the entire HTTP API
│   ├── dashboard/       The restaurant owner's product
│   ├── menu/[slug]/     The public guest menu
│   └── page.tsx         Marketing homepage
├── components/          Shared UI. `ui/` holds the primitives.
├── lib/                 All business logic and data access
│   ├── auth/            Session, guards
│   ├── export/          Excel + CSV writers, the shared sheet style, dataset projections
│   ├── i18n/            fa.ts defines the Dictionary type; en.ts must match
│   ├── images/          Upload processing
│   ├── payments/        Zarinpal behind a provider interface
│   └── storage/         Filesystem paths for uploads
├── templates/           The 11 public menu designs
│   ├── shared/          Behaviour every template gets (cart, sheets, chrome)
│   └── registry.ts      Maps templateId → component
└── generated/prisma/    Generated client. Never edit; run `npx prisma generate`.
```

`data/` sits **beside** `core/`, never inside it: uploads, backups, snapshots,
logs. See `DATA-BOUNDARY.md`.

---

## The layering rule

This is the one convention that explains most of the codebase.

```
route handler / page   →   *-server.ts   →   pure domain module
   (HTTP, auth)            (Prisma)          (arithmetic, rules)
```

**Pure domain modules** decide what the business rules are. They import
_nothing_ — no Prisma, no React, no `server-only` — so they can be tested
directly. Each has its own test file.

| Module                                                          | Decides                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------- |
| `pricing.ts`                                                    | What a basket costs                                           |
| `discounts.ts`                                                  | What a code is worth, and why one was refused                 |
| `order-options.ts`                                              | What starts ticked, what a tap does                           |
| `availability.ts`                                               | Whether a dish can be ordered right now                       |
| `inventory.ts`                                                  | What a dish takes off the shelf                               |
| `upsell.ts` / `bundles.ts` / `upgrades.ts` / `co-occurrence.ts` | Which suggestion a guest sees                                 |
| `customers.ts` / `retention.ts`                                 | Who a regular is, and why they lapsed                         |
| `profitability.ts`                                              | What a dish actually earns                                    |
| `tables.ts`                                                     | What a table is worth                                         |
| `sales-insights.ts`                                             | What changed, and whether it is worth saying                  |
| `time.ts` / `insight-periods.ts`                                | Where a trading day starts; what a figure is compared against |
| `phone.ts`                                                      | What makes two phone numbers the same person                  |
| `units.ts`                                                      | What a kilogram is in grams; which units a recipe may use     |
| `costing.ts`                                                    | What a dish costs; what its price shows; when to warn         |

Most have a `-server.ts` sibling that does the Prisma work and hands the result
in. **If you are adding business logic, it goes in a pure module with a test —
not in a route handler and not in a component.**

---

## Invariants

Break these and something important breaks quietly.

**Tenant isolation.** One database, one schema, `restaurantId` on every
tenant-owned table. **A tenant id may only come from the session** — never from
a body, query string or route param. Enforced by `src/lib/auth/guards.ts`.
Three test files assert it against the source text so an _unscoped_ query
cannot be added unnoticed: `analytics-isolation`, `customers-isolation`,
`tables-isolation`.

**Permissions.** Four roles: `SUPER_ADMIN` (no tenant), `OWNER`,
`BRANCH_MANAGER`, `STAFF`. Access to grantable sections is decided by **one
function** — `canAccessTab` in `staff-tabs.ts`. Six grantable tabs: `orders`,
`menu`, `design`, `qr`, `analytics`, `finance`. Settings, subscription,
customers, campaigns and reviews are deliberately absent from that list, which
means they _cannot_ be granted rather than being granted-then-refused.

**Money.** Whole Toman in `Int` columns. The ×10 Rial conversion happens only
in `payments/zarinpal.ts`. Order arithmetic is
`subtotal → −discount → +service → +tax → rounding → +tip`, every figure
snapshotted onto the order. `createOrder` is server-authoritative: the client
says _which_ product and _which_ option, never what anything costs.

**Prices are exact underneath and rounded on top.** `Product.priceExact` is
the real price; `Product.price` is what a guest sees and pays — the exact price
at the venue's `menuPriceStep`, derived by `shownPrices` in `costing.ts` and
never the other way round. Every write goes through it: a manual edit, the bulk
tool, an ingredient's cost moving, a change of step. Rounding inside the
arithmetic is what made repeated increases compound on figures that were never
the real price. Every existing reader keeps reading `price`. A price field
re-sent unchanged by the editor is not a change, or each save would overwrite
the exact price with its rounded one. `costing-integrity.test.ts` fails if any
code writes `price` without deriving it.

**Ingredient cost drives dish cost and, optionally, dish price.** An ingredient
has a structured unit (`units.ts`) and a purchase price quoted in any unit of
the same kind. A dish whose recipe is fully priced gets its `costPrice` from the
recipe (`costFromRecipe`), which is what orders snapshot. When an ingredient's
price changes and `autoRepriceFromCost` is on, every dish using it moves by
exactly the change in _its own_ ingredient cost — margin in Toman is kept, not
margin in percent. An ingredient's first price moves nothing: it establishes the
cost rather than raising it. Recipe edits change cost, never price. Price
warnings (`priceHealth`) are warnings, never refusals.

**Which orders count.** `order-status.ts` — one definition, in Prisma and SQL
form. Cancelled orders are excluded; orders still in the kitchen count.

**Revenue.** `total − tax − tip`, via `netRevenue` in `analytics.ts`. Collected
tax is owed to the government and a tip belongs to staff; counting either would
invent profit.

**Time.** Every reporting boundary derives from `APP_TIME_ZONE` through
`time.ts`, never from the host clock.

**Chains.** A branch is a full tenant that does not own a menu.
`menuOwnerId()` in `menu.ts` is the _only_ place that distinction is resolved.
Menu content, pricing rules and customers come from the menu owner; orders,
tables, menu-view counts and reviews stay with the branch.

---

## Main flows

### A guest orders

1. `GET /menu/[slug]?table=7` — server component, `revalidate = 60`. The table
   number rides in the QR link and prefills checkout.
2. `templates/registry.ts` picks the design; `templates/shared/` provides the
   cart, product sheet and chrome that every template shares.
3. `POST /api/public/orders` → `createOrder` in `orders.ts`. Prices, discounts
   and options are all resolved from the database inside one transaction, which
   also links the customer and deducts stock.
4. The guest polls `GET /api/public/orders/[token]`. That endpoint returns
   progress only — **no money, no phone number**.
5. The kitchen board receives it over SSE (`/api/orders/stream`, Postgres
   LISTEN/NOTIFY).

### An owner edits the menu

`/dashboard/menu` → `builder.tsx` → `/api/products`, `/api/categories` →
Prisma. Product fields are validated by `validation.ts`, which the form and the
route both import.

### A report is produced

Page → `analytics.ts` (or `chain.ts` for a chain, `admin.ts` for the platform)
→ a pure module for the judgement → rendered. **Never mix the three reporting
layers.** Exports are projections of those same providers — `export/datasets.ts`
maps each dataset to the provider it renders, so a file and a screen cannot
disagree.

### A file is exported

`GET /api/export?dataset=…` → `datasets.ts` returns typed columns (money,
percent, date, phone…) and rows → `xlsx.ts` by default, or `csv.ts` with
`format=csv`. **Excel is the default because CSV breaks on Iranian machines:** a
Windows set to the Persian format expects `؛` between fields, so a comma file
opens with each row in one column, and a CSV cannot carry direction, font or
number formats at all. Every sheet is right-to-left, Tahoma, right-aligned with
right-to-left reading order, with a frozen, filtered header. That look lives in
`sheet-style.ts` alone, and `xlsx.test.ts` fails if a colour or font appears in
the writer. Text passes through `normalisePersian` (`ي`→`ی`, `ك`→`ک`) and
is never reshaped. Excel shapes Persian itself, and pre-shaped glyphs are what
break it.

---

## Authentication

**Sign-in is phone + one-time SMS code. There are no passwords.** The phone is
the account: `User.phone` is unique, stored as `09XXXXXXXXX` (`normalisePhone`)
and CHECK-constrained. Codes are issued and checked in `auth/otp-server.ts` on
top of the pure rules in `sms/otp.ts`:

- Stored as an HMAC keyed with AUTH_SECRET and bound to number and purpose
  (`SIGNUP`, `LOGIN`, `CHANGE_PHONE`); single use; 3-minute expiry; locked
  after 5 wrong guesses; a new request deletes the previous unanswered codes.
- 60 s resend cooldown, plus limits per number and per address (`OTP_LIMITS`).
- **No answer reveals whether a number is registered.** Sign-in texts only an
  active account's number and sign-up only an unregistered one, but both store
  a challenge and answer identically, and the SMS is sent without being awaited
  so response time says nothing either.
- In development the code is printed to the console, never sent.

Accounts created by someone else (staff, branch managers, admin-created owners)
start with `phoneVerifiedAt` null; their first sign-in proves the number.
Changing a number sends the code to the _new_ number (`/api/account/phone`).

`src/proxy.ts` (Next 16's renamed middleware) verifies the cookie's _signature_
at the edge and redirects when it is missing — it cannot check revocation,
because Prisma does not run on the Edge runtime.

The authoritative check is `getSessionUser()` in `auth/session.ts`, used through
the guards in `auth/guards.ts`:

| Guard                           | Use                                            |
| ------------------------------- | ---------------------------------------------- |
| `requireTenant()`               | Any signed-in tenant member                    |
| `requireOwner()`                | Owner-only data (customers, settings, billing) |
| `requireTab(tab)`               | A grantable section, in an API route           |
| `requirePageTab(tab, returnTo)` | The same, in a page                            |
| `requireChainOwner()`           | Chain-level reporting                          |
| `requireAdmin()`                | The platform console                           |

Every one of them derives the tenant from the session.

---

## API conventions

All routes live under `src/app/api/`. Every handler is wrapped in `route()` from
`lib/api.ts`, which turns thrown `HttpError`s and Zod failures into one response
shape:

```json
{ "ok": true,  "data": { ... } }
{ "ok": false, "error": { "message": "...", "code": "SOME_CODE" } }
```

Clients use `lib/client-api.ts`. Codes — not messages — drive UI branching, so
copy can change without breaking behaviour.

`/api/public/*` is unauthenticated by design and rate limited per address
(`RATE_LIMITS` in `constants.ts`). Those endpoints return the minimum a guest
needs and never accept a restaurant id.

---

## External services

**There are two outbound HTTP calls in the entire source tree**, each behind an
interface with a working mock:

| Call              | Where                      | Interface         | Off switch                         |
| ----------------- | -------------------------- | ----------------- | ---------------------------------- |
| Zarinpal payments | `lib/payments/zarinpal.ts` | `PaymentProvider` | `PAYMENT_PROVIDER=mock`            |
| Melipayamak OTP   | `lib/sms/melipayamak.ts`   | `SmsProvider`     | `SMS_PROVIDER=mock`, `SMS_DRY_RUN` |

SMTP (backups only) is the other outbound connection.

**The SMS API carries one-time codes and nothing else.** One operation —
`SendByBaseNumber`, one approved pattern to one number — behind `sendTransactional`
in `lib/sms/index.ts`. It is the one thing here that costs money per use, so both
defaults spend nothing: the provider is `mock` and `SMS_DRY_RUN` is `true`
_including in production_.

Melipayamak is spoken to as **SOAP over plain `fetch`**, not through the
`melipayamak-api` npm package. That package cannot send pattern messages at all
(no `SendByBaseNumber`), hardcodes `http://` so the account password travels in
clear text, and pulls seven critical advisories in through `soap@0.23`.

**Promotional SMS does not use the API at all.** A venue buys a broadcast — text,
audience, price — and pays the platform through the ordinary gateway; the paid
request waits at `/admin/sms`, where staff download the recipient file and send
it with a separate tool. `lib/sms-broadcast.ts` holds the rules (consent,
pricing, lifecycle), and `sms-broadcast-isolation.test.ts` fails if any
broadcast module can reach the SMS sender or if a venue-facing route can return
a phone number. The recipient list is frozen when the broadcast is priced,
because the bill is recipients × SMS parts × rate.

If you add an integration, put it behind an interface in `lib/` the same way,
and keep the mock working.

---

## Environment

`src/lib/env.ts` validates configuration at boot and refuses to start on
anything missing or nonsensical — including a `localhost` `NEXT_PUBLIC_APP_URL`
in production mode, which is why `npm run build` fails on a dev box unless you
pass a real domain.

| Variable                                                            | Notes                                                                                    |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                      | Local Postgres runs on **5433**                                                          |
| `AUTH_SECRET`                                                       | No fallback anywhere. Generate with `crypto.randomBytes(48)`                             |
| `NEXT_PUBLIC_APP_URL`                                               | **Baked into QR codes at generation time.** Set the real domain before printing anything |
| `DATA_DIR`                                                          | Customer data, outside the app tree                                                      |
| `PAYMENT_PROVIDER`                                                  | `mock` or `zarinpal`                                                                     |
| `STORAGE_DRIVER`, `SMTP_*`, `TRUSTED_PROXY_HOPS`, `ALLOW_DEMO_SEED` | See `.env.example`                                                                       |

---

## Running locally

All commands run from `core/`. Node 22+.

```bash
npm install
```

```bash
powershell -ExecutionPolicy Bypass -File ./scripts/pg-portable.ps1 start
```

```bash
npx prisma migrate deploy && npx prisma generate && npm run db:seed
```

```bash
npm run dev
```

**Restart the dev server after `prisma generate`** — the running process caches
the old client and returns confusing 500s while the typecheck stays green.

| Command               | Does                                                                |
| --------------------- | ------------------------------------------------------------------- |
| `npm run verify`      | typecheck → lint → format → tests. Run before calling anything done |
| `npm run db:snapshot` | JSON snapshot into `../data/snapshots/`                             |
| `npm run backup`      | Customer-data archive                                               |

Deployment is covered end to end in `LINUX-DEPLOY.md`.

---

## Where to change things

| Task                            | Go to                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Add a product field             | `prisma/schema.prisma` → migration → `validation.ts` → `menu/product-dialog.tsx` → `templates/types.ts` |
| Change what a basket costs      | `pricing.ts` (and its test)                                                                             |
| Change how menu prices round    | `roundMenuPrice` / `shownPrices` in `costing.ts` — the only place; the venue's step is `menuPriceStep`  |
| Change what a dish costs        | `recipeCost` in `costing.ts`; recomputed by `refreshRecipeCosts` in `costing-server.ts`                 |
| Add an ingredient unit          | `units.ts` **and** the CHECK constraints + trigger in the costing migrations — the lists must match     |
| Change when a dish is orderable | `availability.ts` — both callers already read it                                                        |
| Add a menu design               | `templates/<name>/`, register it in `registry.ts`                                                       |
| Change the QR link              | `dashboard/qr/manager.tsx`. **Printed codes embed the URL — changing it invalidates them**              |
| Add a report                    | A pure module + a `-server.ts`, then a page                                                             |
| Add an export                   | `export/datasets.ts` — project an existing provider, do not recompute; give every column a kind         |
| Change how exported files look  | `export/sheet-style.ts` — font, colours, alignment, number formats, widths; the only place              |
| Change the SMS broadcast price  | `SMS_PRICE_PER_PART` in `.env` — per SMS part, per recipient                                            |
| Change who can see a section    | `staff-tabs.ts`                                                                                         |
| Change subscription behaviour   | `plans.ts`, `subscription/`                                                                             |
| Add UI copy                     | `i18n/fa.ts` first — it defines the type, so a missing English key is a compile error                   |

---

## Constraints that shaped the design

Iranian venues are the market, and sanctions rule out the usual defaults: no
Stripe, no AWS/Vercel, no Google Maps or Fonts, no Twilio. Payments go through
Zarinpal, hosting through an Iranian VPS, and all four fonts are self-hosted in
`public/fonts`. **Never add a dependency that fetches from a blocked CDN at
runtime or build time.**

The product is Persian-first: RTL uses logical properties (`ms-`, `pe-`,
`start-`, `end-`) except where geometry is genuinely physical — up and down are
physical. Phone numbers, times and dates carry `dir="ltr"`. Persian text is
never letter-spaced, because Arabic-script letters join.

Priority when these conflict: **existing functionality > stability > security >
simplicity > performance > new features.**
