# Feature proposals

**Status: Phase 0 — discovery only. No source file has been changed.** Waiting
for you to choose which features to build, and in what order.

Written 2026-09-30. Fourth plan in this series; read with
`RENAME_AND_CLEANUP_PLAN.md`, `INVENTORY_AND_FIXES_PLAN.md` and
`ADMIN_CMS_PLAN.md`. Their decisions are all still open. **Nothing proposed here
repeats them:**

- inventory purchases, waste and stocktake are in the inventory plan;
- plan and content editing are in the CMS plan;
- the order-permission fix (I1) and the manual online-payment fix (I2) are in
  the cleanup plan.

---

## Two things to settle first

### 1. Per-plan feature flags vs. your earlier rule

On 2026-09-07 you set the rule **"no plan-gated feature restrictions — the
product scales on usage and capacity, never by withholding functionality"**.
This brief asks for every new feature to sit behind a per-plan flag.

- **Proposed reconciliation:** each plan gets a feature-flag map, with every
  flag **on by default for every plan**. You then have the switch without
  anything being withheld until you decide to.
- **Enforcement:** a flag is enforced on the server (the route refuses) and
  hides the UI.
- **Editing the flags:** from the admin panel once the plans manager in
  `ADMIN_CMS_PLAN.md` exists. It does not exist yet, so the first feature
  would also add a small flags-only page under `/admin/plans` — see decision 2.

### 2. Things you ruled out on 2026-09-07

**POS, delivery, reservations, loyalty wallet, staff performance, full
accounting, AI, native apps, marketplace.** They stay out; they are listed under
"rejected" with that reason. You have since asked for full inventory, so if any
of these has also changed, tell me.

---

## What the platform already does (so nothing below duplicates it)

| Module    | Already built                                                                                                                                                                                                                                                                                                                           |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Menu      | Categories and products with images; option groups with price and cost; bilingual fa/en; availability toggle; scheduled availability windows; hide-when-unavailable; exact price with a rounding step; bulk price change; merchandising (featured, recommendations, bundles, upgrades, pairings); 11 templates; theme and design editor |
| Guest     | Table QR (table number carried in the link); cart; discount codes; tips, service charge, tax, rounding; cash or online payment (Zarinpal); live order tracker; waiter call; post-order rating                                                                                                                                           |
| Staff     | Live kitchen board over SSE (received → preparing → ready → delivered, cancel, cash paid toggle, refund queue); manual order entry; staff accounts with grantable tabs; staff-call inbox                                                                                                                                                |
| Money     | Finance page (revenue, COGS, gross/net profit, expenses); printable financial report; product profitability and menu engineering classes; right-to-left Excel exports                                                                                                                                                                   |
| Insight   | Analytics with rule-based sales insights; peak hours; table intelligence; menu views; dashboard insights (menu health)                                                                                                                                                                                                                  |
| Customers | Customer identity by phone; segments and retention; campaign planning; paid promotional SMS request (sent by hand)                                                                                                                                                                                                                      |
| Stock     | Ingredients, recipes, deduction at order, low-stock card, costing and automatic repricing (upgrade proposed in the inventory plan)                                                                                                                                                                                                      |
| Chains    | Branches sharing the owner's menu; chain summary                                                                                                                                                                                                                                                                                        |
| Platform  | Phone + code sign-in; subscriptions; admin console; support tickets; backups                                                                                                                                                                                                                                                            |

**Confirmed missing:**

- printing an order (bill or kitchen ticket);
- a combined bill per table;
- marking a dish sold out from the kitchen board;
- an end-of-day cash close;
- dine-in vs takeaway;
- dietary tags;
- a "request the bill" call;
- any measure of kitchen speed.

---

## How the gaps were found

### Daily operations

What cashiers, waiters and kitchens still do by hand, as far as this product is
concerned:

- write or print a bill;
- add up several QR orders from one table;
- shout "we're out of X";
- count the till at night against a total from somewhere;
- tell takeaway customers apart;
- answer "is this spicy / vegetarian?" at every table.

### Competitors

Iranian products this product is compared against at sale time:

- [FoodCafe](https://foodcafe.ir/Home/Software) lists customer and kitchen
  printing, sale types (dine-in, takeaway, delivery), table status and a
  customer club.
- [Mupra](https://mupra.ir/restaurant-software/) lists the till, order types
  (dine-in / «بیرون‌بر»), a kitchen display, queueing and reservations, and a
  loyalty club.
- [MenuDigital](https://menudigital.ir/) lists a QR menu with waiter tablets, a
  kitchen screen, and allergen and dietary information.
- The accounting-first product
  [Mahak](https://www.mahaksoft.com/restaurant-accounting-software/) advertises
  printing kitchen tickets automatically (per the search result summary; I did
  not read that page in full).

International guides say the same:

- end-of-day reports that reconcile cash drawers
  ([Quantic](https://getquantic.com/restaurant-pos-system-features/),
  [Toast](https://pos.toasttab.com/blog/on-the-line/restaurant-pos-guide));
- an open tab per table and "tap to request the bill" from the QR menu
  ([Eat App](https://restaurant.eatapp.co/pay-at-table),
  [FineDine](https://www.finedinemenu.com/en/blog/qr-code-ordering-and-fast-checkout-a-complete-guide-for-restaurants/)).

Beyond these pages, the ranking uses my own domain knowledge.

### Your own data (development database)

- **98% of orders carry a table number,** and a single table records up to 9
  orders in a day. Combined table bills have real material to work on.
- **Kitchen-stage timestamps:** every order has `placedAt`, and 11,957 have
  `deliveredAt`, but only 22 have `readyAt` (the seeded history skips those
  steps). A kitchen-speed report only has material once venues use the board
  for real.
- **1 review and 4 waiter calls** exist, so anything built on reviews is
  premature.

---

## Ranked shortlist (best value for effort first)

Every feature:

- reuses the existing guards (`requireTab`, session-derived tenant id);
- goes through `route()` (CSRF);
- has Zod validation with Persian messages;
- follows the pure-module + `-server.ts` layering, with tests.

**Plan** is "all plans, flag on" per settle-first point 1. No feature needs a
paid service or external API.

### 1. Print the bill and the kitchen ticket — «چاپ فاکتور و فیش آشپزخانه»

|                 |                                                                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Problem / users | Cashiers hand guests a paper bill; many kitchens still want paper tickets. Today the only thing that prints is the finance report and QR sheets.                                                     |
| Value           | **High.** Every competitor above lists it, and its absence is a sales objection ("can it print?").                                                                                                   |
| Effort          | **Small.** A print page per order rendered for 80 mm receipt paper and A5, using the browser's print dialog, so it works with any printer the venue already has. No driver, no hardware requirement. |
| Touches         | Orders (read-only), the board and order detail (a print button).                                                                                                                                     |
| Risk            | Very low — read-only, no schema change.                                                                                                                                                              |

**UX:** on the board or in the order detail, tap «چاپ» and choose «فاکتور
مشتری» or «فیش آشپزخانه».

- **The bill:** venue name and logo, Jalali date and time, order number, table,
  items with options, discount, service, tax, tip and total, payment status.
- **The ticket:** the same minus prices, with large type and notes highlighted.

An optional setting prints the kitchen ticket automatically when a new order
arrives on a board left open on the kitchen PC (one confirm per order — browsers
don't allow silent printing).

### 2. Combined table bill — «صورتحساب میز»

|                 |                                                                                                                                                                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Problem / users | Guests order in rounds through the table QR; at checkout the cashier adds up several orders by hand.                                                                                                                                                      |
| Value           | **High** for table-service restaurants; it is the "open tab" every QR-ordering product offers.                                                                                                                                                            |
| Effort          | **Small–medium.** Read-side grouping of today's unsettled orders by table; «تسویه میز» marks that table's cash orders paid in one transaction by reusing `markOrderPaid`'s rules. Online-paid orders are shown as already paid. Prints through feature 1. |
| Touches         | Orders board, payment status (cash only, existing rules).                                                                                                                                                                                                 |
| Risk            | Low–medium — it changes payment status, so it goes through the existing function and permission. It should follow the I1 fix (order endpoints honour the `orders` grant).                                                                                 |

**UX:** the board gets a «میزها» view: one card per occupied table with its open
orders, total and paid-so-far, and actions «چاپ صورتحساب» and «تسویه نقدی».
Tapping a table shows its orders.

### 3. "Sold out" from the kitchen board — «تمام شد»

|                 |                                                                                                                                                                                                                                                                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Problem / users | The kitchen runs out of a dish mid-service; only someone with menu access can switch it off, so guests keep ordering it.                                                                                                                                                                                                                 |
| Value           | **High** — a daily event (the industry calls it "86-ing").                                                                                                                                                                                                                                                                               |
| Effort          | **Small.** A new nullable `Product.soldOutUntil`. The single availability rule (`resolveAvailability`) treats a dish as unavailable until then. The board lists today's dishes with a «تمام شد» switch. It resets **automatically at the start of the next trading day** (`APP_TIME_ZONE`), so nobody has to remember to switch it back. |
| Touches         | `availability.ts` (the one place the rule lives), the board, the audit log.                                                                                                                                                                                                                                                              |
| Risk            | Low. Ordering is refused server-side at once; the public menu shows it within its existing 60-second refresh. Staff with the `orders` grant can set it, without gaining menu-editing rights.                                                                                                                                             |

**UX:** on the board, the «تمام شد» button opens a searchable list of dishes;
tap one and it greys out with «تا پایان امروز». «موجود شد» undoes it.

### 4. End-of-day close — «بستن صندوق»

|                 |                                                                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Problem / users | At night the cashier counts the till and compares it with a total pieced together from the board or paper.                                                                                                    |
| Value           | **High** — a standard daily ritual, and a trust feature for owners who are not on site.                                                                                                                       |
| Effort          | **Medium.** A new `DailyClose` table (site, trading day, expected cash, counted cash, difference, who, when, note), one per day per site. A pure calculation module. A page and a print view (via feature 1). |
| Touches         | Orders (read), finance (read), a new table.                                                                                                                                                                   |
| Risk            | Low — read-mostly; nothing existing changes.                                                                                                                                                                  |

**UX:** «بستن صندوق» shows the trading day's figures: orders; sales by payment
method (cash / online); paid vs still unpaid (listed); cancellations and refunds;
discounts; tips; tax.

The cashier then types the counted cash; the difference is shown in red or
green; they confirm and print. Owners see past closes in a list. Branch managers
close their own site only.

### 5. Dine-in or takeaway — «سرو در سالن / بیرون‌بر»

|                 |                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Problem / users | Cafés and fast-food venues sell a large share as takeaway; today every order looks like a table order, and takeaway guests have no pickup number.                                                                                                                                                                                                                                    |
| Value           | **High** for cafés and fast food, which are a large part of the market.                                                                                                                                                                                                                                                                                                              |
| Effort          | **Medium.** A new `Order.serviceType` (default `DINE_IN`, so all history stays as it is). A choice in the shared cart drawer, so all 11 templates get it at once: shown when the QR has no table, hidden when it does. A pickup number (the order number) on the tracker. A badge and filter on the board, a choice on the manual order form, and a split in the reports and export. |
| Touches         | `createOrder`, the shared cart, the board, reports.                                                                                                                                                                                                                                                                                                                                  |
| Risk            | Medium — it touches the checkout every template uses. It is **takeaway only** (no address, no courier), so it stays clear of the delivery you ruled out.                                                                                                                                                                                                                             |

**UX:** a guest who scans the counter QR is asked «سرو در سالن یا بیرون‌بر؟».
Takeaway orders show «شمارهٔ سفارش شما: ۴۲» on the tracker and a «بیرون‌بر» badge
on the board.

### 6. Dietary and info tags on dishes — «برچسب‌های غذا»

|                 |                                                                                                                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Problem / users | Guests ask "is this spicy / vegetarian / does it have nuts?"; staff answer at every table.                                                                                                                                                                                           |
| Value           | **Medium.** A guest-trust and accessibility feature listed by competitors (MenuDigital).                                                                                                                                                                                             |
| Effort          | **Small–medium.** A fixed tag list: «تند»، «گیاهی»، «وگان»، «بدون گلوتن»، «حاوی مغزها»، «لبنیات»، «جدید». Stored as a `Product.tags` array; set in the product dialog; rendered as small icon chips by the shared pieces and product sheet, with an optional filter row on the menu. |
| Touches         | Menu builder, the shared template pieces.                                                                                                                                                                                                                                            |
| Risk            | Low–medium — a visual change on every template, so each of the 11 is checked on a phone. Nothing shows until an owner adds a tag.                                                                                                                                                    |

**UX:** tick the tags in the product dialog. Guests see small chips under the
dish name, and can tap «گیاهی» at the top to filter.

### 7. "Request the bill" button — «درخواست صورتحساب»

|                 |                                                                                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Problem / users | Guests wave for the bill; the waiter call has one generic kind.                                                                                            |
| Value           | **Medium–high.** It speeds table turnover, and together with feature 2 the cashier sees exactly what that table owes.                                      |
| Effort          | **Small.** A new `StaffCall.kind` (`CALL` default, `BILL`), a second button in the guest menu's call sheet, and a distinct label on the board's call list. |
| Touches         | Staff calls (existing rate limit applies), the board.                                                                                                      |
| Risk            | Low.                                                                                                                                                       |

**UX:** the guest taps «درخواست صورتحساب»; the board shows «میز ۷ صورتحساب
می‌خواهد» with a shortcut to that table's bill.

### 8. Kitchen speed — «زمان آماده‌سازی»

|                 |                                                                                                                                                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Problem / users | Owners don't know how long orders wait, or when the kitchen falls behind.                                                                                                                                                        |
| Value           | **Medium.** Useful, but only once venues move orders through the board's stages (the dev history has none).                                                                                                                      |
| Effort          | **Small.** On the board, a live "waiting N minutes" timer that turns amber and then red past a threshold the owner sets. In analytics, average and 90th-percentile placed → ready by hour and by dish, from existing timestamps. |
| Touches         | Board (display), analytics (read).                                                                                                                                                                                               |
| Risk            | Low. It measures orders, not people, so it stays clear of the "staff performance" you ruled out.                                                                                                                                 |

**UX:** cards on the board show «۱۲ دقیقه» and change colour when late.
Analytics gets a «سرعت آشپزخانه» card.

### Suggested order

**3 → 1 → 7 → 2 → 4**, then 5, 6 and 8 as you like. 3, 1 and 7 are small and
visible on day one; 2 builds on 1 and 7; 4 builds on 1.

---

## Worth considering later (one line each)

- A **"ready orders" screen** for a TV at the counter, showing pickup numbers live (after feature 5).
- **Kitchen stations:** filter the board by bar vs kitchen, by category.
- **Dish ratings** derived from order ratings — once there are enough reviews.
- **Menu import from Excel** — deliberately deferred while onboarding is done by hand for the first 100 venues.
- **Recurring expenses** entered automatically each month (rent, salaries).
- **Time-based prices** ("happy hour") by extending availability windows to prices.
- **An Arabic menu** for religious-tourism cities (Mashhad, Qom) — a third locale across templates.
- **A printable paper menu** (A4) generated from the digital menu.
- **Split bill by item** for online payment.
- **Move or merge tables** on the board.
- **A simple stamp card** («هر ۱۰ قهوه، یکی مهمان ما») — close to the loyalty you ruled out; ask first.
- **Board resilience:** a visible "reconnecting" state and catch-up after a dropped connection.

---

## Considered and rejected

| Idea                                                                   | Why not                                                                                                                    |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Delivery, courier («پیک») management, Snappfood-style aggregator links | You ruled out delivery; aggregators are third-party APIs.                                                                  |
| Reservations and queueing with SMS reminders                           | You ruled out reservations; automatic SMS breaks the OTP-only rule.                                                        |
| Loyalty wallet, stored credit, referral codes                          | You ruled out a loyalty wallet.                                                                                            |
| Card-reader (POS terminal) integration, caller ID, kiosks              | Specialised hardware and vendor integrations; you ruled out POS.                                                           |
| Staff attendance, per-employee performance                             | You ruled out staff performance.                                                                                           |
| Tax-authority e-invoicing («سامانهٔ مودیان»)                           | A government API with registration and certificates — an external integration. Worth revisiting when customers ask for it. |
| Automatic SMS (order ready, birthdays, win-back)                       | Breaks the rule that the API sends OTP codes only.                                                                         |
| AI menu descriptions, photo enhancement, demand forecasting            | Rule-based insights already cover the value without AI or a paid model.                                                    |
| Ordering through Telegram / Bale / Eitaa bots                          | Third-party APIs and a second channel to support.                                                                          |
| Native apps, marketplace                                               | Ruled out.                                                                                                                 |
| Custom domains                                                         | Server and certificate work per venue. The feature is advertised but does not exist — flagged in `ADMIN_CMS_PLAN.md` (P4). |

---

## Decisions I need from you

1. **Which features, in which order?** My suggestion: 3 → 1 → 7 → 2 → 4, then
   5, 6 and 8.
2. **Feature flags.** OK to add a feature-flag map to plans, **on for every plan
   by default**, with a small flags-only `/admin/plans` page until the CMS plans
   manager exists? Or skip flags and keep "no plan-gated features"?
3. **Takeaway (feature 5):** confirm that takeaway pickup is in scope even
   though delivery is not.
4. **Before any feature:** the other plans' blockers still apply. Commit the
   pending v14 work on `main`, and fix I1 (order endpoints honouring the
   `orders` grant), which features 2 and 3 build on. Features go on
   `feat/new-features`, one feature per set of commits.
