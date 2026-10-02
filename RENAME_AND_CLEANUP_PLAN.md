# Rename and cleanup plan — رستوکار / Restokar

**Status: Phase 0 — audit only. No source file has been changed.** Waiting for
approval before Phase 1.

Written 2026-09-29 against `main` at `6dbbf11` plus the uncommitted v14 work
(70 modified, 15 new, 2 deleted), which matches the v14 handoff archive
byte for byte (500 files, zero differences).

---

## Baseline (recorded before any change)

| Check                                       | Result                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `npm run typecheck`                         | clean                                                                                                                          |
| `npm run lint`                              | 0 errors, 12 warnings (the documented `set-state-in-effect` ones)                                                              |
| `npm run format:check`                      | clean                                                                                                                          |
| `npm run test`                              | **1330 passed, 70 files**                                                                                                      |
| `npm run build` (`NEXT_PUBLIC_APP_URL` set) | succeeds; 2 Turbopack warnings: dynamic filesystem access in `api/upload` and `uploads/[...path]`                              |
| Database                                    | 39/39 migrations applied                                                                                                       |
| App on `localhost:3000`                     | homepage, `/pricing`, `/login` render; all 11 template demos + a venue, a chain parent, a branch and an empty venue return 200 |
| Sign-in (phone + code)                      | works for a branch manager, a staff member and the platform admin                                                              |
| `/api/health`                               | 503 `degraded` — no `restokar-backup-*` archive exists (see R6)                                                                |

---

## Part A — The rename

### Short version

**The rename was already carried out on 2026-09-23**, including the parts this
brief marks high-risk: the PostgreSQL database and role, the session cookie, the
JWT issuer and audience, browser storage keys, the notify channel, and backup and
export filenames. The application tree contains **zero** occurrences of the old
name. What remains is outside the application: workspace notes, historical data
and build cache.

Phase 1 is therefore small. Most of it is cleanup outside `core/`, plus
decisions about historical records, which I recommend keeping.

### How it was searched

- `ripgrep`, case-insensitive, pattern `menu[-_ ]?land|منو ?لند` (covers
  Menuland, MenuLand, menuland, MENULAND, menu-land, menu_land, Menu Land,
  منولند, منو لند) over the whole workspace (`core/`, `data/`, workspace files).
- Plain `grep -r` over `core/` as well, because ripgrep skips gitignored files
  (`.env`, `.next`, `src/generated`).
- File and folder names (`find -iname '*menu*land*'`).
- The database: every object name (database, roles, tables, columns,
  constraints, functions, triggers) and **every text/JSON column of every
  table**, read-only.
- Git history (commit messages only; history is never rewritten).
- There is no PWA manifest, no service worker, no CI config and no image
  containing text in `public/` (it holds only fonts), so those categories are
  empty.

### Findings

| #   | Where                                                                                                                           | Hits               | Category                         | Proposed action                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `core/` source, config, `.env`, `.env.example`, migrations, seeds, templates, tests, docs, `package.json`, `docker-compose.yml` | **0**              | a / b / c / d                    | None.                                                                                                                                                                                                                      |
| R2  | Database object names (DB, role, tables, columns, constraints, functions, triggers)                                             | **0**              | d                                | None. Renamed in place on 2026-09-23.                                                                                                                                                                                      |
| R3  | DB rows: `AuditLog.actorEmail` (52), `SubscriptionExtension.adminEmail` (1) — value `admin@menuland.ir`                         | 53 rows            | d — historical record            | **Keep.** An audit trail records who acted at the time; rewriting it falsifies history.                                                                                                                                    |
| R4  | DB row: `RateLimit.key` `login:acct:admin@menuland.ir`                                                                          | 1 row              | d — expired counter              | Keep; the backup housekeeping prunes expired rate-limit rows on its next run.                                                                                                                                              |
| R5  | `data/snapshots/*.json` (38 files)                                                                                              | 5–12 per file      | d — historical restore points    | **Keep.** Editing a snapshot changes what a restore would put back.                                                                                                                                                        |
| R6  | `data/backups/menuland-backup-*.tar.gz` (6 archives, 24 Aug – 12 Sep)                                                           | 6 filenames        | d — historical backups           | **Keep the names.** The pruner keeps the 14 newest `restokar-backup-*`; renaming them would have them deleted about a week later. Instead, take one fresh backup (`npm run backup`), which also turns `/api/health` green. |
| R7  | `core/.next/dev/` — 123 compiled files from 16–18 Sep                                                                           | old source comment | build output                     | Delete `core/.next/dev` with the dev server stopped; it is regenerated on the next `npm run dev`.                                                                                                                          |
| R8  | `claude-project/.next/` (27 Aug, outside `core/`)                                                                               | —                  | build output, orphaned           | Delete.                                                                                                                                                                                                                    |
| R9  | `claude-project/README.md` — heading "Menuland — workspace"                                                                     | 1                  | a — workspace notes (not in git) | Update to "Restokar — workspace" and point at `core/README.md` and `core/docs/`.                                                                                                                                           |
| R10 | `claude-project/project-overview.md` — 4 hits, and its figures date from Aug (301 files, 59 endpoints, 698 tests)               | 4                  | a — workspace notes (not in git) | Either rename the product in it and mark it "historical, superseded by `core/docs/ARCHITECTURE.md`", or delete it. It is not in git, so deletion cannot be undone. **Your choice.**                                        |
| R11 | `claude-project/.claude/launch.json` — dev-server entry named `menuland`                                                        | 1                  | c — tooling                      | Rename the entry to `restokar` (it only names the preview entry; the command already points at `core/`).                                                                                                                   |
| R12 | `claude-project/.claude/settings.local.json` — 14 old permission entries (e.g. `%LOCALAPPDATA%\menuland-pg`, old handoff zips)  | 14                 | tooling history                  | Leave. They are records of past commands; the paths no longer exist, so they allow nothing.                                                                                                                                |
| R13 | Git history — initial commit `05baa8b` "Initial commit: Menuland application source"                                            | 1                  | history                          | **Keep.** It is already pushed; rewriting published history breaks every clone.                                                                                                                                            |
| R14 | Desktop folders `menuland-handoff-v*`                                                                                           | folder names       | outside the project              | Name the next handoff `restokar-handoff-v15`. Old folders are yours to keep or remove.                                                                                                                                     |

### Persisted identifiers — why no compatibility layer is proposed

The brief asks for old cookie/storage keys to be migrated on read and old URLs
to be redirected so nobody is logged out and no printed QR code breaks. That is
the right rule for a live product. Here it has nothing to protect:

- The product has **never been deployed** — no real users, sessions, carts or
  printed QR codes exist under the old name. The only sessions that existed
  under `menuland_session` were development sessions, already replaced.
- Public menu URLs are `/menu/<slug>` and never contained the product name. QR
  codes embed `NEXT_PUBLIC_APP_URL`, which has only ever been `localhost` or
  `restokar.ir`.
- No environment variable name contains the old name, so no env fallback is
  needed.
- There is no service worker, so there is no cache name to bump.

**If the old domain (e.g. `menuland.ir`) was ever live or printed anywhere,
tell me.** The fix would then be a permanent 301 from the old domain to
`restokar.ir` at nginx, outside the app, and I would add it to the deploy guide.

### Manual checks outside the codebase

| System                  | What to check                                                                                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Melipayamak panel       | The text of OTP pattern **543544** lives in the panel, not in code (the app sends only the code as a variable). Confirm the wording says «رستوکار», not «منولند». Same for the sender line if it carries a name. |
| Zarinpal merchant panel | The registered website/domain must be `restokar.ir`. Callback URLs are built from `NEXT_PUBLIC_APP_URL` (`/api/payments/callback?purpose=order \| subscription \| sms`).                                         |
| DNS / hosting           | `restokar.ir` A record to the VPS; `NEXT_PUBLIC_APP_URL="https://restokar.ir"` in the server `.env` **before** any QR code is printed.                                                                           |
| GitHub                  | Repo is already `aradkiani/restokar`. Nothing to do.                                                                                                                                                             |

---

## Part B — Old vs new feature conflicts

**Critical: none found.** No query or endpoint lets one venue read or change
another venue's data. The tenant id always comes from the session, and the
source-level isolation tests (`analytics-`, `customers-`, `tables-`,
`sms-broadcast-isolation`, `costing-integrity`, `phone-auth`) pass.

### Important

#### I1 — The order endpoints ignore the `orders` permission

The Orders tab became an explicit, exclusive grant for STAFF. The pages were
updated (`requirePageTab("orders")`), but four API routes still only check that
the caller belongs to the venue (`requireTenant`):

| Route                            | What any staff member of the venue can do                          |
| -------------------------------- | ------------------------------------------------------------------ |
| `GET /api/orders`                | list up to 200 orders — names, items, totals, tips, payment status |
| `PATCH /api/orders/[id]/status`  | move orders through the kitchen workflow                           |
| `PATCH /api/orders/[id]/payment` | mark cash orders paid or unpaid                                    |
| `GET /api/orders/stream`         | receive the live order feed                                        |

**Proven in the browser:** signed in as kafe-shabaneh's menu/design-only staff
member (`09003493453`), `/dashboard/orders` correctly redirects away, but
`GET /api/orders?scope=all` returned **200 with 200 orders**. The status and
payment routes were not exercised, to avoid changing data. Their code path is
the same check.

- **Fix:** `requireTab("orders")` in the three `route()` handlers and a
  `canAccessTab(user, "orders")` check in the stream. Add a source-level guard
  test in the style of the existing isolation tests. `GET /api/orders` has no
  caller in the UI at all, so it is guarded rather than deleted (smallest change).
- **Risk: low.** Every UI caller of these endpoints is already behind
  `requirePageTab("orders")`. Owners and branch managers hold the tab by role.
  Staff calls (`/api/staff-calls`) deliberately stay open to all staff, as their
  comment explains.

#### I2 — Manual order "پرداخت آنلاین" creates an order that can never be paid

The manual-order form (`dashboard/orders/new/form.tsx`) always offers
«پرداخت آنلاین». Manual orders never open a gateway session, and two later
rules now contradict that option:

1. `createOrder` refuses `ONLINE` unless the platform switch and the venue
   switch are both on. The platform switch (`ENABLE_PAYMENTS`) is **off by
   default in production**, so the cashier gets an error.
2. When both are on, the order is created **unpaid**. `markOrderPaid` refuses
   anything but cash ("settled by the gateway"), and the board only retires an
   order once it is paid. The order stays unpaid on the board for good, and
   paid-date reports never count it.

No manual orders exist in the data yet (0 rows), so there is nothing to migrate.

- **Fix (smallest):** manual orders are settled at the counter — remove the
  «پرداخت آنلاین» option from the form and have `createOrder` refuse
  `ONLINE` when `isManual` is set, so the API cannot create a stuck order either.
  Add a test.
- **Alternative (a feature, so not proposed):** a real "card at the counter"
  method that staff can mark paid.
- **Risk: low.**

#### I3 — A branch manager's home page is still the single-venue page

`/dashboard` for a branch manager reads menu data by the **branch's** id, but a
branch owns no menu (`menuOwnerId()` is used everywhere else). Seen in the
browser as karimi-1's manager:

- header «۰ محصولات · ۰ دسته‌بندی‌ها»;
- a «وضعیت منو» (menu health) card computed on an empty menu;
- low-stock warnings read from the branch's inventory, which is always empty
  (stock is the chain owner's), so a branch manager never sees one;
- quick actions «افزودن محصول» and «طراحی منو», which silently bounce to
  Orders because branch managers cannot open Menu or Design.

- **Fix:** filter the quick actions through `canAccessTab`. For a branch, hide
  the product/category counts and the menu-health and low-stock cards (they
  belong to the owner's dashboard). No data change.
- **Risk: low.** Only the branch view changes; the owner's page is untouched.

#### I4 — The old plans still apply old-model limits to 20 of 21 subscriptions

The public tiers (`tier-small` … `tier-chain`) carry unlimited products and
categories — the seed says capping menu size "penalises the venues getting the
most out of the product". But the three retired, hidden plans still have their
old limits, and **20 of the 21 subscriptions are on them**:

| Plan                                | Venues                                                 | Still enforced                                                                      |
| ----------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `starter`                           | 4 (demo-atlas, demo-linen, kafe-azma, sofreh-golestan) | max **40 products, 8 categories**, 10 tables; **online payment not allowed**        |
| `pro`                               | 12                                                     | max 200 products, 25 categories, 40 tables                                          |
| `enterprise` («زنجیره‌ای», "chain") | 4                                                      | no limits, but `allowsBranches = false` — a plan named "chain" cannot open branches |
| `tier-chain`                        | 1 (karimi)                                             | —                                                                                   |

`prisma/seed.ts` creates these legacy plans with their caps, so a fresh
production database would carry the same conflict. Related minor points: the
online-payment plan gate is checked only when settings are saved, not in
`createOrder` (no current venue is affected), and `Plan.maxDailyViews` is shown
to owners but never enforced (already known).

This is a pricing decision, so **I need your answer**:

- **(a) Recommended:** keep the legacy plans (their prices are grandfathered)
  but lift the old caps: `maxProducts = maxCategories = -1`,
  `allowsOnlinePay = true`. Done as a new data migration plus the same change in
  the seed. Reversible (the old values are recorded in the migration's comment).
- **(b)** Move every legacy subscriber onto the matching new tier (changes what
  they would be billed at renewal).
- **(c)** Leave as is and document it.

**Risk:** (a) low, (b) medium, since it touches billing.

#### I5 — Every guest downloads the whole dashboard's text and all 11 designs

Measured on the production build, the public menu page loads **364 KB of
JavaScript (102 KB gzipped)**. Two parts of that grew with the platform rather
than with the menu:

- **The complete fa + en dictionary — 163 KB (49 KB gzipped), about half the
  page.** It includes dashboard, admin, campaign and finance copy that a guest
  never sees. Cause: `templates/menu-view.tsx` (a client component) calls
  `getDictionary` from `i18n/client.ts`, which imports both full dictionaries.
- **All 11 templates in one 116 KB chunk (24 KB gzipped)**, although a venue
  renders exactly one. Cause: `menu-view.tsx` imports every template statically.

- **Fix, step 1 (larger win, lower risk):** the server page passes MenuView only
  the dictionary sections the templates use, instead of the client importing
  both languages whole.
- **Fix, step 2:** load the chosen template with `next/dynamic` (server-rendered,
  so no flash).
- Measure before and after, and click through all 11 templates on a mobile
  viewport.
- **Risk: medium.** It touches how every template receives text; a missed
  dictionary key shows as a blank label. Proposed **last** in Phase 2, as its
  own commit.

### Minor

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Proposed action                                                                                            | Risk |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---- |
| M1  | `requirePageTenant` (`auth/guards.ts`) redirects an account with no venue to **`/register/restaurant`, which does not exist** — left from the old "sign up, then create the restaurant" flow. Admins never reach it (they are sent to `/admin` first); an owner whose venue was removed would get a 404.                                                                                                                                                                                                                                                                  | Redirect to `/login` instead.                                                                              | low  |
| M2  | **Provably unused production code** (no reference outside its own file, typecheck will prove it): `setOrderTip` + `OrderTipSchema` (editing a tip after the fact — no route since at least the first commit), `deliveredVisibleSince` (the board's old visibility rule; it now uses "paid for an hour"), `listAuditLog`, `getPalette`, `containedBackdropStyle`, `CardDescription`, `archiveSize`, `resetRateLimit`, `pruneRateLimits` (the backup housekeeping deletes rate-limit rows itself), `isSmsAudience`, `FONT_IDS`, `MINUTE_MS`, and six unused exported types. | Remove. Test-only pure helpers (`verifyChallenge`, `canResend`, …) stay: they are the tested public rules. | low  |
| M3  | Duplicated constant: `MAX_PRODUCT_INFO_SECTIONS = 3` is unused while `validation.ts` hard-codes `.max(3)` twice.                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Use the constant in both places.                                                                           | low  |
| M4  | Orphaned columns: `Restaurant.latitude` / `longitude` (never read or written), `Plan.allowsCustomDomain` (seeded, never read — there is no custom-domain feature). `User.email` / `passwordHash` are unused on purpose since OTP sign-in.                                                                                                                                                                                                                                                                                                                                 | **Leave.** Dropping columns is a destructive migration with no user-facing benefit. Documented only.       | —    |
| M5  | Homepage headline counts: the comment says demos are excluded, but the order count includes demo orders (7 of 12,797). The counts are also public, which the v14 handoff already flagged; they are aggregates and name no venue.                                                                                                                                                                                                                                                                                                                                          | Exclude demo orders. Whether to show the counts at all is your call.                                       | low  |
| M6  | `upload` accepts files from any member of the venue, including kitchen-only staff.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Leave (rate-limited, tenant-scoped folder). Mentioned for completeness.                                    | —    |
| M7  | Subscriptions past `currentPeriodEnd` stay fully usable with only a banner (4 venues locally). Looks deliberate ("never lock an owner out").                                                                                                                                                                                                                                                                                                                                                                                                                              | Leave; confirm it is intended.                                                                             | —    |
| M8  | `templates/shared/souvenir.ts` says "the other five" templates — there are 11. The souvenir section is **bazaar-only by design**; other templates show a «سوغاتی» category inline like any other.                                                                                                                                                                                                                                                                                                                                                                         | Fix the comment. Giving every template its own souvenir section would be a new feature.                    | none |
| M9  | Build warning: dynamic filesystem access in the two upload routes makes Next trace the whole project when bundling. Affects deploy size, not runtime.                                                                                                                                                                                                                                                                                                                                                                                                                     | Leave for now; revisit when deploying.                                                                     | —    |
| M10 | No backup has been taken since 2026-09-12, and no scheduled backup task is installed on this machine. The OTP migration and costing data are in no archive.                                                                                                                                                                                                                                                                                                                                                                                                               | Before Phase 1: `npm run db:snapshot` and `npm run backup`.                                                | none |

### Checked and consistent (no action)

- **One write path per thing:** products (`/api/products`, bulk price and
  costing all derive `price` via `shownPrices`), orders (public and manual both
  go through `createOrder`), restaurant settings (the design, settings and
  pricing-options forms write **disjoint** fields — checked key by key).
- **Availability:** one pure function (`resolveAvailability`) read by both the
  menu and ordering.
- **Utilities:** one phone normaliser, one digit converter, one money formatter
  (test-enforced).
- **Branches:** branch managers cannot open Menu or Design (`BRANCH_MANAGER_TABS`,
  confirmed in the browser); a branch's public menu shows the owner's menu
  (karimi-1 renders); stock, customers, recommendations and ordering resolve
  through `menuOwnerId()`.
- **Templates:** all 11 use the shared cart, chrome, pieces and runtime, so
  ordering, availability and options behave the same. `ember` and `vitrin` are
  registered with their own featured surfaces.
- **Homepage showcase:** demo venues only (`isDemo`), one per template.
- **Dead files:** none — every source file is imported (only test setup files
  are loaded by config).
- **Indexes:** the hot paths (orders by venue and date, status, customer phone,
  payments, audit log, events) are covered. No N+1 found in request paths;
  the two loops that write inside a transaction are bounded (option groups of
  one product, ingredients of one order).

---

## Proposed order of work (after approval)

0. **Safety:** `npm run db:snapshot pre-cleanup` and `npm run backup` (M10).
1. **Branch:** see decision 1 below, then `git switch -c chore/rename-restokar`.
2. **Phase 1 — rename cleanup** (R7–R11): workspace notes, launch entry, stale
   build caches. One commit for anything inside `core/` (probably none), the
   rest is outside git.
3. **Phase 2 — one commit per fix, in this order:** I1 → I2 → I3 → I4 (as
   decided) → M1 → M2 + M3 → M5 → M8 → I5 (last, measured). `npm run verify`
   after every commit; a guard test for I1 and tests for I2 and M1.
4. **Phase 3:** build, verify, and a mobile/RTL walk-through of sign-in → menu
   with options and availability → every template → order → board → payment →
   reports → branch permissions. Then the final report appended here.

## Decisions I need from you

1. **Uncommitted v14 work** (phone sign-in, price separators, مثقال removal)
   sits on `main`, uncommitted, and `6dbbf11` is not pushed. Branching now would
   put it on the cleanup branch. **Recommended:** first commit it on `main` as
   the three commits the last session proposed, _after_ removing your real
   phone number from `scripts/assign-dev-phones.ts`, then branch.
2. **I4 — legacy plans:** (a) lift the caps, (b) migrate subscribers, or (c)
   leave?
3. **I2 — manual orders:** remove «پرداخت آنلاین» (recommended), or keep it
   for a later "card at the counter" feature?
4. **I5 — bundle work:** include it in this pass (last, measured), or leave it
   for a separate task?
5. **R10 — `project-overview.md`:** mark as historical, or delete?
6. **Was an old domain ever live** or printed on anything? If not, no redirects
   are needed.
