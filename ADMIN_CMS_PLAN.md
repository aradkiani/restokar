# Admin CMS and plans — plan

**Status: Phase 0 — audit only. No source file has been changed.** Waiting for
approval before Phase 1.

Written 2026-09-30. Third plan in this series. `RENAME_AND_CLEANUP_PLAN.md` and
`INVENTORY_AND_FIXES_PLAN.md` exist, and **none of their decisions has been
answered yet**, so nothing in them is resolved and nothing here undoes them.
Where this plan touches the same code, it says so (e.g. I4 there = legacy plans).

---

## Baseline (re-run today, before any change)

- `npm run verify`: typecheck clean, lint 0 errors / 12 known warnings,
  Prettier clean, **1330 tests passing**.
- Production build succeeds (recorded 2026-09-29; no source changed since).
- `/`, `/pricing`, `/login` and `/register` return 200.
- Working tree: unchanged apart from the two earlier plan files.

---

## 1 — Every piece of public content, and where it lives today

The public site is **four pages**: `/`, `/pricing`, `/login`, `/register`. Add
the "powered by" line on every restaurant's public menu. There is **no** about,
terms, privacy, testimonials or announcement page or section. There is also no
favicon, Open Graph image, robots or sitemap file.

The site is **bilingual**: Persian by default, English through the language
toggle (cookie `restokar_locale`). Almost all copy lives in the two
dictionaries, `src/lib/i18n/fa.ts` and `en.ts`. Everything below exists in both
languages unless marked.

| #   | Content                                                                                                                                           | Lives in                                                                                                             | Shown on                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| C1  | Site name «رستوکار»                                                                                                                               | `t.common.appName`                                                                                                   | header, footer, auth panel, public-menu footer |
| C2  | Default SEO: title, title template `%s \| رستوکار`, description, keywords, OG site name/locale, theme colour                                      | `src/app/layout.tsx` — **Persian only**, even when the page is shown in English                                      | every page                                     |
| C3  | Per-page SEO: `/pricing` and `/register` titles and descriptions (both say «۱۴ روز رایگان»)                                                       | `metadata` in each page file — Persian only                                                                          | `/pricing`, `/register`, `/login`              |
| C4  | Header navigation labels and CTAs                                                                                                                 | `t.nav.*`, `t.landing.ctaContactSupport`                                                                             | `/`, `/pricing`                                |
| C5  | Hero: badge, title, accent line, subtitle, primary CTA (two variants: registration open / closed), secondary CTA, note                            | `t.landing.hero*`                                                                                                    | `/`                                            |
| C6  | Stats row: **live** venue and order counts, template count, and their labels                                                                      | `t.landing.stats*` + database counts                                                                                 | `/`                                            |
| C7  | Features: title, subtitle, **8 items** (icon + title + text)                                                                                      | `t.landing.features*`, `t.features.*`; icons are fixed in `page.tsx`                                                 | `/`; 4 of them are also on the auth side panel |
| C8  | How it works: title, subtitle, **3 steps**                                                                                                        | `t.landing.how*`, `step1–3*`                                                                                         | `/`                                            |
| C9  | Demo showcase: title, subtitle, «پیش‌نمایش» label; the cards are the demo venues' own name/tagline/logo (database, edited from each demo account) | `t.landing.demo*`; `Restaurant` rows with `isDemo`                                                                   | `/`                                            |
| C10 | Pricing section: heading, subtitle, "payments paused" notice, plan cards                                                                          | `t.landing.ctaSubtitle`, `paymentsPausedBody`; plans from the database                                               | `/`, `/pricing`                                |
| C11 | Plan feature lists                                                                                                                                | **Hard-coded by position** in `pricing/page.tsx` (tier 1, 2, 3 and the contract card), built from dictionary strings | `/pricing`                                     |
| C12 | FAQ: title + **7 questions and answers**                                                                                                          | Two arrays inside `components/marketing/faq-list.tsx`                                                                | `/`                                            |
| C13 | Contact block: title, subtitle, CTA, phone, email                                                                                                 | `t.landing.*` + `CONTACT` in `lib/constants.ts` — **placeholder `021-00000000`**                                     | `/`, and the owner's subscription page         |
| C14 | Footer: brand, 4 links, © year, rights text                                                                                                       | `page.tsx`, `t.landing.footerRights`                                                                                 | `/`                                            |
| C15 | Auth side panel: hero title, accent, subtitle, 4 feature items                                                                                    | `(auth)/layout.tsx` reusing C5 and C7 strings                                                                        | `/login`, `/register`                          |
| C16 | «ساخته‌شده با رستوکار» on every restaurant's public menu                                                                                          | `templates/shared/footer.tsx`, `t.publicMenu.poweredBy`                                                              | every `/menu/[slug]`                           |
| C17 | Trial length «۱۴ روز»                                                                                                                             | `TRIAL_DAYS = 14` in code **and** typed into 4 separate strings (hero CTA, pricing subtitle, 2 SEO descriptions)     | `/`, `/pricing`, `/register`                   |
| C18 | Logo mark                                                                                                                                         | An icon component in the header; no uploaded image                                                                   | header, auth panel                             |

**Stays in code, not proposed as editable:**

- dashboard and admin copy;
- the guest menu and ordering UI;
- order tracking;
- validation and error messages;
- 404/500 pages;
- `/payment/mock` (development only);
- the OTP SMS wording (it lives in the Melipayamak panel).

These are product UI, not marketing content. Editing them from an admin screen
would let a typo break a checkout.

---

## 2 — Every place plans and prices exist

The `Plan` table already exists and is already the source of the **amount
charged**. There is **no screen to edit it**: plans come only from
`prisma/seed.ts`, so changing a price today means SQL or a re-seed.

| Where                                           | Reads                                                                                                         | Notes                                                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Homepage pricing section                        | `Plan` (public)                                                                                               | Shows monthly price, **products / categories / tables** limits, "analytics" and "online payment" rows.                                   |
| `/pricing`                                      | `Plan` (public)                                                                                               | Shows monthly and yearly price, **tables / daily views** limits, then a **position-based** feature list; the contract tier as "from … ". |
| Owner's plan picker (`/dashboard/subscription`) | `Plan` (public)                                                                                               | Shows **products / categories / daily views / tables** + analytics + online payment. Only shown when online subscription checkout is on. |
| "Recommended" badge                             | **`index === 1`**, hard-coded separately in all three places above                                            | Not a plan property.                                                                                                                     |
| Sign-up (`/api/auth/register`)                  | Cheapest public plan (`sortOrder` first)                                                                      | 14-day trial, `TRIAL_DAYS` constant.                                                                                                     |
| Admin new account / extend                      | Any plan, including hidden legacy ones                                                                        | No payment.                                                                                                                              |
| Checkout (`/api/subscription/checkout`)         | `plan.monthlyPrice` / `yearlyPrice` **from the database, on the server**                                      | The client sends only `planCode` + `interval`. Good. See P1, P2.                                                                         |
| Gateway                                         | `Payment.amount` × 10 → Rial only in `payments/zarinpal.ts`                                                   | Verified against the stored amount on callback.                                                                                          |
| Receipts / history                              | `Payment` rows (owner's subscription page, `/admin/revenue`)                                                  | `Payment.amount` is already a snapshot of what was charged. There is no invoice document.                                                |
| Renewal                                         | Manual: the owner pays again at the **current** plan price; the callback extends the period by 1 or 12 months | No automatic charging exists.                                                                                                            |
| Limits enforced                                 | `plans.ts`: products, categories, tables — **read live from the plan**                                        | A plan edit would change every subscriber at once. No snapshot.                                                                          |
|                                                 | `allowsBranches` (chain guards, dashboard layout)                                                             | Live.                                                                                                                                    |
|                                                 | `allowsOnlinePay` (only when the owner saves settings)                                                        | Live.                                                                                                                                    |
|                                                 | `maxDailyViews` — **displayed, never enforced**                                                               | Known.                                                                                                                                   |
|                                                 | `allowsAnalytics` — **displayed, never enforced**                                                             |                                                                                                                                          |
|                                                 | `allowsCustomDomain` — **advertised on the chain tier, feature does not exist**                               |                                                                                                                                          |
| Other platform prices                           | `SMS_PRICE_PER_PART` in **`.env`** (promotional SMS, default 200 Toman)                                       | Changing it needs a restart.                                                                                                             |

### Where the price shown and the plan granted come from different places

#### P1 — Checkout switches the plan before payment — **critical (money)**

`/api/subscription/checkout` writes the new `planId` and `interval` onto the
subscription **before** redirecting to the gateway, and the `Payment` row does
not record which plan or interval it was for. Consequences:

- An owner who starts checkout for a bigger plan and abandons it **keeps the
  bigger plan's limits without paying**.
- Starting a checkout for a smaller plan and abandoning it downgrades them.
- Two overlapping checkouts can grant plan B for a payment made at plan A's
  price, because the callback reads whatever `interval` the subscription holds
  when the payment lands.

**Fix:** the payment row records the plan, the interval and a snapshot of the
price and limits. The subscription changes **only** in the payment callback,
from that snapshot.

#### P2 — The contract-priced «چند شعبه» tier can be bought online — **important (latent)**

It is public, so the owner's plan picker lists it with a buy button, and
checkout never checks `isContractPriced`. Paying its "starting from" price would
unlock branches without a contract. This is dormant today because online
subscription checkout is switched off (the page shows a contact card instead).

**Fix:** refuse contract plans in checkout and hide them from the picker.

#### P3 — Three different descriptions of the same plans — **important (consistency)**

Homepage, `/pricing` and the owner's picker each show a different set of limits
and features, and each decides "recommended" by position.

**Fix:** one plan read-model, used by all three.

#### P4 — `/pricing` promises differences the product does not have — **important (content)**

Its per-tier lists say online payment, finance and a bilingual menu start at the
middle tier, and staff accounts, bulk pricing and priority support at the top
tier. Every tier actually has all of them (by design: "no plan-gated features").
The chain card promises a custom domain, which does not exist.

**Not changed silently:** Phase 1 seeds these lists exactly as they are (no
visual change), and you correct them in the new editor. See decision 6.

#### P5 — Trial length is written in five places

The `TRIAL_DAYS` constant, plus four strings (hero CTA, pricing subtitle, two
SEO descriptions).

**Fix:** one setting; the strings use a `{trialDays}` placeholder that renders
«۱۴» until the setting changes.

---

## 3 — The admin panel today

- **Routes:** `/admin`, `/admin/restaurants` (+ `[id]`), `/admin/accounts/new`,
  `/admin/revenue`, `/admin/expiring`, `/admin/support`, `/admin/sms`,
  `/admin/settings` (backup email only).
- **Auth:** one role, `SUPER_ADMIN`, with no restaurant.
  - Pages: `requirePageAdmin()` (and `proxy.ts` redirects signed-out users).
  - APIs: `requireAdmin()` on **every** `/api/admin/*` route (checked in the
    earlier audit).
  - Admins sign in by phone code like everyone else (`09000000000` locally).
- **Already available to build on:**
  - `recordAudit()` accepts platform-level entries (`restaurantId: null`).
  - `route()` rejects cross-origin writes (CSRF), and the session cookie is
    `SameSite=Lax`.
  - `rateLimit()` with named buckets.
  - The image pipeline: canvas resize in the browser, plus server checks on
    dimensions and file signatures, with no native library.
  - `/uploads/...` serving, which also accepts a `site/` folder.
  - `PlatformSetting` singleton.
- **Missing:** anything to do with content or plans. No admin audit-log viewer
  (`listAuditLog` exists but is unused — M2 in the cleanup plan).

---

## 4 — Proposed design (adapted to this codebase)

### 4.1 Content model: the schema lives in code, the values live in the database

- **A typed schema in code** — `src/lib/cms/schema.ts`, a pure module with tests
  — describes each document as sections → fields.
  - Field types: `text`, `textarea`, `richText` (limited), `number`, `image`,
    `link`, `boolean`, `list` (of any of these).
  - Each field has a max length, whether it is required, and **its default,
    which is today's exact string** (read from the dictionaries), so layout and
    defaults stay in code.
- **Localised text fields** hold `{ fa, en }`. Persian is required; empty
  English falls back to today's English string (decision 1).
- **Documents:**

  | Key                                      | Contents                                                                                                  |
  | ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
  | `site`                                   | name, logo, favicon, contact, socials, footer text, default SEO, trial days, show live stats (default on) |
  | `announcement`                           | on/off, text, link, from/to dates                                                                         |
  | `home`                                   | C5–C14                                                                                                    |
  | `pricing`                                | heading, subtitle, notice, SEO                                                                            |
  | `auth`                                   | C15 + login/register SEO                                                                                  |
  | `faq`                                    | list of question + answer                                                                                 |
  | `menuFooter`                             | C16                                                                                                       |
  | _(optional)_ `about`, `terms`, `privacy` | decision 4                                                                                                |

- **Rendering:** `getContent("home")` returns the published values merged over
  the code defaults, field by field. A missing, empty or invalid field falls back
  to the default, so a bad value can never break a page. Icons, order and layout
  stay in the page components.

**New tables (one additive migration):**

| Table             | Columns                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `ContentDocument` | `key` (PK), `draft Json?`, `published Json?`, `version Int`, `draftUpdatedAt/By`, `publishedAt/By`                            |
| `ContentVersion`  | `id`, `documentKey`, `version`, `data Json`, `publishedAt`, `publishedById`, `restoredFrom?` — immutable; one row per publish |

**Seeding:** `npm run cms:seed`, idempotent. It writes today's text into each
document as published version 1 and never overwrites an existing document. Even
before it runs, the site renders identically, because every field falls back to
the same default.

### 4.2 Plans: a single source of truth

**`Plan` gains** (additive migration):

- `descriptionEn`
- `isRecommended` — seeded `true` on today's index-1 plan, `tier-medium`
- `features Json` — a list of `{fa, en}`, **seeded with today's exact
  per-tier lists**
- promotion: `promoMonthlyPrice?`, `promoYearlyPrice?`, `promoStartsAt?`,
  `promoEndsAt?`
- `draft Json?`
- `version Int`

**`PlanVersion`** holds the history (full plan JSON per publish, with who and
when).

**One pure pricing module**, `plan-pricing.ts` (tested):

- `effectivePrice(plan, interval, now)` applies the promotion window.
- `planCard(plan, locale)` is the one read-model the homepage, `/pricing` and
  the owner's picker all render. This fixes P3.
- **Checkout calls the same `effectivePrice` on the server.** The client still
  sends only a plan code and an interval.

**Purchase snapshot (fixes P1):**

- `Payment` gains `planId`, `interval` and `planSnapshot Json` (price charged,
  limits, plan name).
- On a verified callback, the subscription takes the plan, interval and
  `limitsSnapshot` from **that payment's snapshot**.
- Checkout no longer touches the subscription.

**Limits read from the subscriber's snapshot.** `Subscription` gains
`priceSnapshot` and `limitsSnapshot Json`.

- `plans.ts`, the chain guards and the online-pay gate read
  `limitsSnapshot ?? plan` (the live plan only as a fallback).
- A price or limit edit therefore never changes an existing subscriber's
  current period.
- A migration backfills every existing subscription's snapshot from its current
  plan. **Blocked on decision 3.**

**Delete protection:** a plan with any subscription or payment cannot be
deleted — the API refuses, and the foreign keys already restrict it. It can only
be deactivated (`isPublic = false`: hidden from pricing and sign-up, and still
valid for existing subscribers).

**Also fixes:**

- P2: contract plans are never purchasable online.
- P5: trial days come from the `site` document.
- `SMS_PRICE_PER_PART` becomes a platform setting, with `.env` as the fallback
  (decision 5).

**Money:** whole Toman `Int` everywhere, as today. Formatting only through
`formatMoney`.

### 4.3 Editing safety

- **Draft → preview → publish.** Saving writes `draft` only.
  - **Preview** uses Next's `draftMode()`, enabled by an admin-only route.
  - The public page renders the draft only when draft mode is on **and** the
    session is `SUPER_ADMIN`, and shows a thin «پیش‌نمایش پیش‌نویس» bar.
    Anyone else sees the published version.
  - **Publish** copies draft → published, writes a `ContentVersion`, invalidates
    the cache and audits.
- **History and restore:** each document and plan lists its versions. Restoring
  copies an old version into the draft; you then preview and publish it (never
  straight to live).
- **Audit:** new actions `CONTENT_PUBLISHED`, `CONTENT_RESTORED`,
  `PLAN_PUBLISHED`, `PLAN_DEACTIVATED` and `SITE_SETTINGS_CHANGED`, with a
  field-level diff in `metadata`. Price changes store the old and new Toman
  values.
- **Price publish confirmation:** a dialog showing old → new monthly and yearly
  price, promotion, and how many active subscribers are on the plan (unaffected
  until renewal).
- **Validation:** Zod schemas shared by form and route, with Persian messages
  (required, max length, number range, `https://` / `tel:` / `mailto:` links
  only, image type and size).

### 4.4 Security and performance

- **Admin-only on every endpoint:**
  - Every new route calls `requireAdmin()`; every page calls
    `requirePageAdmin()`.
  - A source-level guard test fails if any `/api/admin/*` route does not call
    `requireAdmin` (same style as the existing isolation tests).
  - Restaurant and branch accounts get 403 / redirect. This is tested.
- **Rich text without HTML:**
  - Stored as a tiny markup subset: `**bold**`, `*italic*`, `[link](https://…)`,
    `- ` bullet lists, line breaks.
  - Rendered to React elements by our own renderer — **no
    `dangerouslySetInnerHTML`**, so there is nothing to inject.
  - Link schemes are checked on save and again on render.
  - No new dependency.
- **Images:** PNG, JPEG or WebP only (**no SVG**, because SVG can carry script).
  They go through the existing pipeline into `/uploads/site/…`, which
  `DATA_DIR` and the backup already cover. The favicon is PNG.
- **Mutations:** CSRF via the existing `route()` origin check, plus a new
  `adminWrite` rate-limit bucket.
- **Caching:**
  - Published documents and plans are read through `unstable_cache`, tagged
    `cms:<key>` and `plans`.
  - Publish calls `revalidateTag(tag, { expire: 0 })`, so the change is live on
    the next request, with no redeploy.
  - Production runs one Node process (systemd `npm start`), so tag invalidation
    is enough. If it ever runs several, the existing Postgres
    `restokar_events` channel can carry the invalidation.
  - The homepage reads the session cookie, so it renders per request anyway;
    the cache saves the database round-trips.

### 4.5 Admin screens (existing admin layout, nav and components)

| Route                  | Screen                                                                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/admin/site`          | «تنظیمات سایت»: name, logo, favicon, contact, socials, footer, default SEO, trial days, live-stats toggle; the announcement banner as its own card                                        |
| `/admin/content`       | «محتوای صفحات»: list of documents with status (published / draft changes / never edited)                                                                                                  |
| `/admin/content/[key]` | Section-by-section form with fa/en tabs per text field, repeatable lists (add, remove, reorder with buttons), image fields, «ذخیره پیش‌نویس», «پیش‌نمایش», «انتشار», and a history drawer |
| `/admin/plans`         | Table: name, price, promotion, status, active subscribers, recommended                                                                                                                    |
| `/admin/plans/[id]`    | Edit plan (draft), features list, limits, promotion, publish with price confirmation, deactivate, history                                                                                 |
| `/admin/audit`         | Platform audit log: filter by action and date, old → new values                                                                                                                           |

- Every screen gets loading, empty and error states.
- Mobile-first: the forms stack on phones, the tables become cards.
- Persian digits and Jalali dates, as elsewhere in admin.
- The same quiet look as `/admin/settings`: no gradients, glass or animation.

---

## 5 — Risks and how each is contained

| Risk                                                       | Containment                                                                                                                                                                                                                                     |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The public site changes when content moves to the database | Defaults are the current strings. **Before/after text-content comparison** of `/`, `/pricing`, `/login` and `/register`, in fa and en, plus mobile and desktop screenshots, run before Phase 1 and after every step that touches a public page. |
| Checkout charges a different amount after the refactor     | Record amount per plan × interval through the mock provider before and after. The numbers must match.                                                                                                                                           |
| Snapshots freeze legacy caps                               | Backfill blocked on decision 3 (legacy plans).                                                                                                                                                                                                  |
| An admin publishes something that breaks a layout          | Max lengths per field, field-level fallback, preview before publish, one-click restore.                                                                                                                                                         |
| Some copy is shared with the dashboard                     | Only public pages read the content store; the dashboard keeps its dictionary strings. The strings are duplicated at seed time, not moved.                                                                                                       |
| `unstable_cache` is a legacy-model API                     | It is the documented API for projects without `cacheComponents` (this one). It is used in one module, so it is swappable.                                                                                                                       |
| Money-path changes (P1)                                    | Pure snapshot module with tests; callback applies only verified snapshots. End-to-end through the mock gateway.                                                                                                                                 |

---

## 6 — Order of work (after approval)

**Branch:** `feat/admin-cms`, after the rename/cleanup branch. The uncommitted
v14 work must be committed on `main` first — decision 1 of the cleanup plan.
Before starting: `npm run db:snapshot` + `npm run backup`. `npm run verify`
after every commit.

**Phase 1 — model, migrations, seed, switch-over.** One commit each:

1. Migrations: content tables, plan columns, payment/subscription snapshot
   columns, audit actions.
2. `cms/schema.ts` + `getContent` + fallback tests.
3. `cms:seed`.
4. Switch the public pages to `getContent`: the text-diff must be empty.
5. `plan-pricing.ts` + one plan read-model for the three screens.
6. Checkout snapshot + callback (P1) + contract refusal (P2): the amounts must
   match.
7. Limits read from the snapshot + backfill (as decided).

**Phase 2 — admin screens.** In order: site settings → content editor and
preview → publish/history/restore → plans manager and price confirmation →
audit log.

**Phase 3 — tests and verification.**

- Tests for:
  - server-side price calculation (including promotion windows);
  - the snapshot on purchase;
  - an existing subscription unaffected by a price or limit change;
  - limit enforcement from the snapshot;
  - admin-only access (guard test + 403 tests);
  - rich-text rendering and link sanitising;
  - cache invalidation on publish.
- Manual walk-through on desktop and mobile, in RTL:
  1. edit hero text → preview → publish → live;
  2. change a plan price → pricing page, picker and mock-gateway amount all
     show the new price;
  3. an existing subscriber keeps their limits;
  4. restore a version;
  5. a restaurant account is refused on every admin URL.
- Final report and a short Persian guide appended here.

---

## Decisions I need from you

1. **English on the public site.** Recommended: every text field has a Persian
   value and an optional English one; empty English shows today's English text.
   Alternative: Persian only, with English staying in code.
2. **Renewal pricing for existing subscribers.** Today a renewal is a manual
   re-purchase at the plan's then-current price, and limits follow the live
   plan. Recommended:
   - The price and limits are frozen **for the period already paid**.
   - At renewal the subscriber pays the **then-current** price (including any
     live promotion) and gets the then-current limits.
   - Alternative: keep each subscriber's original price forever
     (grandfathering).
3. **Legacy plans first** (I4 in the cleanup plan). Backfilling snapshots from
   today's plans would freeze the old `starter` caps (40 products, 8 categories,
   no online payment) onto those 4 venues. Please answer I4 before Phase 1
   step 7.
4. **About / terms / privacy pages.** They don't exist today.
   - Recommended: add them as optional documents, hidden and unlinked until you
     publish them — no visual change until then.
   - Or: leave them out.
5. **Other platform numbers.** Move the trial length and the promotional-SMS
   price per part (now in `.env`) into admin settings, with the current values
   as defaults? Recommended: yes.
6. **Plan feature lists.** Seed them exactly as shown today (recommended, so
   there is no visual change) and edit them yourself? Several lines promise
   tier differences or a custom domain the product doesn't have (P4).
7. **Homepage live stats** (13 venues, 12,797 orders): add an on/off toggle,
   defaulting to on as today?
8. **Branch limit.** Today a plan either allows branches or not (unlimited
   count). Keep that, or add a maximum number of branches per plan? That would
   be a new restriction on the chain tier.
