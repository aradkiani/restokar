# Inventory, finance linkage and fixes — plan

**Status: Phase 0 — audit only. No source file has been changed.** Waiting for
approval before Phase 1.

Written 2026-09-29. Read together with `RENAME_AND_CLEANUP_PLAN.md` (same day).
Nothing in that plan is resolved yet — its six decisions are still open — so
this plan **does not repeat its findings**, only refers to them by number
(I1–I5, M1–M10). Where both plans touch the same code, the fix is listed once.

---

## Baseline

Recorded this session before any change: typecheck clean, lint 0 errors /
12 warnings, Prettier clean, **1330 tests passing**, production build succeeds,
39/39 migrations applied. Every owner dashboard page returns 200 with no error
text, and no server or console errors were logged while browsing as an owner,
a branch manager, a staff member and the admin.

---

## A — Inventory today

### Data model

| Table               | What it holds                                                                                                                                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `InventoryItem`     | One ingredient per venue: name (unique per venue), `unit` (`g kg ml l tsp tbsp piece dozen`), `quantityMilli` (thousandths of the unit), `lowStockMilli`, `purchasePrice` (whole Toman per `priceUnit`), `priceUpdatedAt`, `isActive`. |
| `ProductIngredient` | Recipe line: product × item × `perUnitMilli` (+ the unit it was typed in). One line per item per product.                                                                                                                              |
| `StockMovement`     | Ledger row: item, `deltaMilli`, `reason` ∈ {`ORDER_PLACED`, `ORDER_CANCELED`, `MANUAL_ADJUSTMENT`}, optional `orderId`, `createdAt`. **No unit cost, no user, no site, no note.**                                                      |

There are no categories, suppliers, purchases, waste, stocktakes or purchase-unit
conversions (box → pieces). Unit conversion exists only within one dimension
(`units.ts`: kg ↔ g, l ↔ ml ↔ tsp/tbsp, dozen ↔ piece).

### Screens

- `/dashboard/options/inventory`, **owner only** (`requirePageOwner`): add an
  ingredient (name, unit, current quantity, alert level, purchase price), edit,
  delete, and a per-dish recipe editor. It sits inside the Options tab.
- Dashboard home: a «مواد رو به اتمام» card listing low-stock items (owner).
- No movement history, no stock value, no report.

### Logic and how it connects

| Connects to             | Today                                                                                                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Menu items              | A dish with a recipe consumes stock; a dish without one consumes nothing (by design, documented).                                                                                                                       |
| Options                 | **Not connected.** An option choice has a manual `costDelta` for costing, but no ingredients, so a "large" or "extra cheese" choice takes nothing off the shelf.                                                        |
| Orders                  | `deductStock` runs **inside `createOrder`'s transaction** (at placement, status `RECEIVED`). `restoreStockForOrder` runs inside the cancel transaction and reverses exactly the recorded rows, not a recomputed recipe. |
| Refunds                 | A refund only clears a cancelled, paid order from the refund queue — stock was already restored at cancellation. Consistent.                                                                                            |
| Negative stock          | **Allowed on purpose** (comment in `createOrder`: a stale count must never refuse a guest's order).                                                                                                                     |
| Purchases               | **None.** The only way to add stock is to edit the quantity (writes a `MANUAL_ADJUSTMENT`).                                                                                                                             |
| Dish cost               | `costFromRecipe` prices a fully-priced recipe at each item's **latest** `purchasePrice` → `Product.costPrice`. Optional automatic repricing moves the menu price by the Toman change in ingredient cost.                |
| Expenses and accounting | **Not connected.** See B.                                                                                                                                                                                               |
| Reports                 | None use inventory. COGS comes from per-order cost snapshots, not from the ledger.                                                                                                                                      |
| Branches                | **One shared set of shelves per chain.** Items and recipes belong to the menu owner; a branch's orders deduct from the owner's items (`menuOwnerId`). Branch managers cannot see inventory at all.                      |

### Ledger gaps

- **Opening stock is not recorded.** Creating an item with a quantity writes no
  movement, so the sum of movements does not equal the shelf.
- **Deleting an item deletes its history** (`StockMovement` → `onDelete: Cascade`).
- Development data: 1 item (kafe-shabaneh, coffee, 5 kg), 1 recipe line,
  **0 movements**. There is almost nothing to migrate.

---

## B — Money flow today

| Event          | What is recorded                                                                                                                                                                   | Where it lands                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Sale           | `Order`: subtotal → −discount → +service → +tax → rounding → +tip = `total`, plus `costTotal` = Σ(item `costSnapshot` + option `costDeltaSnapshot`) × qty, all fixed at placement. | Revenue = `total − tax − tip` (`netRevenue`), COGS = `costTotal`; cancelled orders excluded. |
| Purchase       | **Nothing.** An owner either edits the ingredient's price and quantity, or records an expense.                                                                                     | —                                                                                            |
| Expense        | `Expense`: title, category (`rent salary utilities supplies marketing other`), amount, date.                                                                                       | Net profit = gross profit − expenses.                                                        |
| Online payment | `Payment` row; Toman × 10 → Rial **only** in `payments/zarinpal.ts`, both on request and on verify.                                                                                | Marks the order paid.                                                                        |

**What is consistent:** one money unit (whole Toman in `Int` columns; `priceExact`
is the documented `Float` exception); one revenue definition used by the
dashboard, analytics, finance page, printable report and Excel export (same
`netRevenue` and the same cancelled-order filter), so those screens agree;
order money is server-authoritative; option costs are snapshotted.

### Findings

#### B1 — Ingredient cost is counted twice when an owner records ingredient purchases — **critical (money)**

The expense category `supplies` is labelled **«مواد اولیه»** ("raw materials")
in Persian. An owner who buys meat and bread naturally records it there. But
those same ingredients are already inside **COGS** through each dish's cost
snapshot, so net profit subtracts them twice. The English help text says the
opposite: "separate from cost of goods". The development data shows both at
once. burger-khaneh, last 90 days: COGS 664,780,000 plus «مواد اولیه» expenses
65,873,817, both subtracted.

**Fix: see decision D2.** It changes how an existing figure is read, so I am
not choosing alone.

#### B2 — The chain page's «سود خالص» ignores cost of goods — **important (money)**

`chain.ts` computes each site's net as **revenue − expenses**, over a rolling
"now minus N days" window. The site's own finance page computes **revenue −
COGS − expenses** over trading-day windows (`resolveRange`). Same branch, same
90 days (karimi-1): the finance-page arithmetic gives **−50,592,000** (a loss);
the chain arithmetic gives **+167,209,000**.

- **Fix:** build each chain row from the same `getFinanceSummary` the branch
  page uses, over the same zone-anchored window.
- **Risk: low.** It changes one displayed figure to match the one already
  shown on each branch's own page.

#### B3 — Unpaid online orders never resolve — **important (money + stock)**

When a guest abandons or fails the Zarinpal payment, the `Payment` row becomes
`FAILED` but the **order stays live**. It is on the board, counted as revenue,
and holding its deducted stock. It can never be marked paid (`markOrderPaid`
refuses non-cash orders), and a delivered one never leaves the board (retirement
needs `PAID`). Development data: **46 such orders, 39,060,000 Toman** (12
received, 18 preparing, 10 ready, 6 delivered).

**Fix: see decision D3.**

#### B4 — A branch manager's product-profit table is empty — **important**

`/dashboard/finance` is open to branch managers (finance tab), but
`getProductProfitability` lists products by the **branch's** id. A branch
owns no products (they belong to the chain owner), so the table is empty
while the branch's sales are not.

- **Fix:** read products by `menuOwnerId()`; keep sales by the branch's id.
- **Risk: low.**

#### B5 — Unit profit and total profit use different bases in one row — **minor**

In «سود محصولات», "profit per unit" is today's price − today's cost, while
"share of profit" is the realised figure from what was sold. Seen on
burger-khaneh: «چیزبرگر ویژه» shows 220,000 per unit, yet 224 sold earned
10,080,000 (sold at a recorded cost of 340,000 in test data).

- **Fix:** label the two columns as current vs realised, and add realised
  profit per unit.
- **Risk: none.** Copy and layout only.

#### B6 — COGS today uses the latest purchase price, not what stock actually cost — **by design, changes with D5**

Dish cost uses each ingredient's latest price. That is fine for pricing, but
it is not a true cost of goods once purchases at different prices exist.
Addressed by the proposed design (weighted average cost).

---

## C — Project-wide bug audit

Already in `RENAME_AND_CLEANUP_PLAN.md`, **not repeated here**:

- I1: the order endpoints ignore the `orders` grant (proven).
- I2: a manual online-payment order can never be paid.
- I3: the branch manager's home page is still the single-venue page.
- I4: legacy plans with old caps.
- I5: guest bundle size.
- M1–M10: minor items.

New findings:

| #   | Severity  | Module         | Finding                                                                                                                                                                                                                                                                                                                | Proposed fix                                                                                                                                                                                | Risk |
| --- | --------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| C1  | important | Orders         | **No server-side status rules.** `PATCH /api/orders/[id]/status` accepts any status from any status. A cancelled order can be moved back to "preparing" or "delivered": it counts as revenue again, but its stock is not taken again. The board itself only ever moves forward and only offers cancel before delivery. | A pure transition table matching the board exactly: RECEIVED → PREPARING → READY → DELIVERED, and CANCELED from the first three; everything else refused with `INVALID_TRANSITION`. Tested. | low  |
| C2  | important | Orders / stock | **Two simultaneous cancels can both restore stock.** `restoreStockForOrder` checks for existing reversal rows and then inserts, with no lock or unique key, and the order update is unconditional.                                                                                                                     | Conditional update (`where: { id, status: previous }`) so only one request wins, plus a unique index on movements per (order, item, reason) as a database-level guarantee.                  | low  |
| C3  | minor     | Ordering       | The guest checkout blocks double taps on the client only. A request retried after a lost response creates a second order (and deducts stock twice).                                                                                                                                                                    | Optional client-generated idempotency key stored on the order (new nullable unique column). Proposed with the order integration step.                                                       | low  |
| C4  | minor     | Finance        | A staff member granted `finance` can open `/dashboard/finance` and call the report API, but the printable report page (`requirePageBranchOperator`) bounces them.                                                                                                                                                      | Guard the page with `requirePageTab("finance")`, like its API.                                                                                                                              | low  |
| C5  | minor     | Inventory      | Opening stock writes no movement; deleting an ingredient erases its ledger; movements carry no cost, user or note.                                                                                                                                                                                                     | Part of the design (D).                                                                                                                                                                     | —    |
| C6  | minor     | All pages      | No `loading.tsx` anywhere: moving between dashboard pages shows no progress while the server renders.                                                                                                                                                                                                                  | One quiet skeleton in `dashboard/loading.tsx` using existing primitives.                                                                                                                    | low  |
| C7  | note      | Data           | Seeded history has 3,638 paid online orders but only 2 `Payment` rows. Not a code bug, but any figure built from `Payment` would disagree with orders on this data.                                                                                                                                                    | None; reports stay order-based.                                                                                                                                                             | —    |

**Checked and fine:** auth/OTP (tests and source guards pass); templates (all 11
render; ordering, options and availability are shared code); payment amounts are
server-computed and verified against the stored amount; no TODOs, stubs or dead
buttons; no cross-tenant access; one money unit.

---

## D — Proposed inventory design (adapted to this codebase)

The existing pieces are sound and stay: milli-unit quantities, the `units.ts`
conversions, recipes on products, deduction inside the order transaction,
ledger-based reversal, and the pure-module + `-server.ts` layering. The upgrade
extends them.

### D.1 Data model (new migrations only, data preserved)

| Change                                                                                                                                                                                                                                                              | Why                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `InventoryItem` += `kind` (`INGREDIENT` / `READY_GOOD` / `PACKAGING`), `categoryName` (free text, optional), `supplierId?`, `purchaseUnitLabel?` + `purchaseUnitFactorMilli?` (e.g. «جعبه» = 24 pieces)                                                             | Categories, ready goods (drinks, souvenirs), box → pieces.                                          |
| `Supplier` (venue, name, phone?, note?, isActive)                                                                                                                                                                                                                   | Purchases by supplier.                                                                              |
| `StockLevel` (item, **site** restaurant, `quantityMilli`, `avgCostPerUnit`), unique (item, site)                                                                                                                                                                    | Per-branch stock and weighted average cost. The catalogue (item, recipe) stays with the menu owner. |
| `StockMovement` += `restaurantId` (site), `unitCost` (Toman per item unit at that moment), `userId?`, `note?`, `purchaseId?`, `stocktakeId?`; reasons += `OPENING`, `PURCHASE`, `WASTE`, `STOCKTAKE`, `RETURN`, `TRANSFER_IN`, `TRANSFER_OUT`; item FK → `Restrict` | A complete, immutable ledger. An item with history is archived (`isActive = false`), never deleted. |
| Unique index on `StockMovement (orderId, itemId, reason)` where `orderId` is set                                                                                                                                                                                    | Exactly-once deduction and reversal, enforced by the database (C2).                                 |
| `Purchase` (site, supplier?, date, invoice no.?, total, `paymentStatus` PAID/UNPAID, user) + `PurchaseLine` (item, quantity, unit, line total)                                                                                                                      | Purchases and payables.                                                                             |
| `Stocktake` (site, status DRAFT/POSTED, user, dates) + `StocktakeLine` (item, expected, counted)                                                                                                                                                                    | Physical count → variance → adjustment.                                                             |
| Optional: `OptionChoiceIngredient` (choice × item × extra amount)                                                                                                                                                                                                   | Options that change ingredients — **only if you want it now (D8)**.                                 |

**Migration of existing data:** for each item, create the head office's
`StockLevel` from today's `quantityMilli`, seed `avgCostPerUnit` from today's
purchase price, and write one `OPENING` movement so the ledger reconciles.
`InventoryItem.quantityMilli` is kept (not dropped) for one release as the
rollback path. **Rollback:** a down script that deletes the new tables and
columns — the old columns were never touched. Snapshot and backup first.

### D.2 Stock logic (pure module + test, one writer)

- A single `postMovement(tx, …)` in `stock.ts` is the **only** writer: it inserts
  the movement and updates `StockLevel` in the same transaction; nothing else
  writes quantities.
- **Weighted average cost** on every purchase:
  `newAvg = (qty × avg + inQty × inCost) / (qty + inQty)`. When stock is at or
  below zero, the purchase cost becomes the new average. Values are whole Toman
  per item unit, rounded once per movement.
- **Negative stock: allowed with a warning** — the existing, documented rule.
  Negative levels show in red on the stock list and the dashboard. (Confirm, D6.)

### D.3 Orders

- Deduction stays **at placement** (status `RECEIVED`), at the **ordering site's**
  stock level. That is when revenue and the COGS snapshot are recorded today, so
  stock, revenue and cost stay in the same moment. Reversal on cancel as now.
  Refunds need nothing extra.
- Exactly once: the unique index plus the conditional status update (C1, C2),
  and optionally the checkout idempotency key (C3).
- Movements carry `unitCost` = the site's average at that moment.

### D.4 Purchases, waste, stocktake

- **Purchase:** pick supplier and date, add lines in the purchase unit or the
  base unit, mark paid or unpaid. Posting writes `PURCHASE` movements and updates
  the average cost. A purchase does not change the ingredient's **reference
  price** (the one that drives menu pricing) unless the owner ticks «به‌روزرسانی
  قیمت مرجع», so auto-repricing never fires by surprise.
- **Waste:** item, amount, reason (spoiled, expired, damaged, staff meal, other),
  note → `WASTE` movement at average cost.
- **Stocktake:** open a count for a site (expected quantities frozen), enter the
  counted amounts, review the variance (quantity and Toman), then post it. That
  writes one `STOCKTAKE` movement per differing item.

### D.5 Accounting treatment (one treatment, no duplicates)

| Event              | Inventory value         | P&L                                                                | Cash / payable             |
| ------------------ | ----------------------- | ------------------------------------------------------------------ | -------------------------- |
| Purchase           | + qty × cost            | **nothing** (not an expense)                                       | paid, or an unpaid payable |
| Sale               | − consumed × avg cost   | revenue (`netRevenue`, unchanged) and **COGS = `Order.costTotal`** | —                          |
| Cancel             | + back at the same cost | order excluded (unchanged)                                         | —                          |
| Waste              | − qty × avg cost        | «ضایعات» line, after gross profit                                  | —                          |
| Stocktake variance | ± qty × avg cost        | «کسری / مازاد انبار» line, after gross profit                      | —                          |
| Expense            | —                       | operating expenses (unchanged), **but not for ingredients** (D2)   | —                          |

- **Net profit** = gross profit − operating expenses − waste − stocktake
  shortage (+ surplus).
- Waste and variance come from the ledger, **not** from new `Expense` rows, so
  nothing can be entered twice.
- **Historical figures do not change:** past orders keep their snapshots, and
  waste/variance lines are zero for every period before the first movement.
- COGS source going forward: **decision D5.**

### D.6 Reports (reusing the finance page, printable report and Excel export)

Per period, and per site for a chain:

- **Existing:** sales, COGS, gross profit, profit per menu item.
- **New:** food cost % (COGS ÷ net revenue), waste cost, stocktake variance,
  inventory value (Σ level × average cost), and purchases by supplier (with
  unpaid totals).

The chain page gets the same figures per site (fixes B2). The Excel export gets
two datasets: `inventory` (stock and value) and `purchases`.

### D.7 Screens and permissions

- Inventory moves to its own dashboard section, «انبار», with tabs:
  - موجودی (stock list with low and negative badges);
  - خرید (purchases);
  - ضایعات (waste);
  - انبارگردانی (stocktake);
  - تأمین‌کنندگان (suppliers);
  - گردش کالا (movement history, filterable).
- Recipes stay beside the menu, where they are today.
- **Owner:** catalogue, recipes, suppliers, every site (site switcher).
- **Branch manager:** stock, purchases, waste and stocktake for **their own
  site only** (the site comes from the session, like every other query). No
  catalogue or recipe edits.
- **Staff:** a new grantable tab `inventory`, own site only.
- Every screen gets loading, empty and error states, validation shared between
  form and route, Persian digits and Jalali dates as elsewhere, and
  mobile-first layout.
- Isolation guard test in the style of `tables-isolation.test.ts`.

---

## E — Order of work (after approval)

**Branch:** finish the rename/cleanup branch first (it is small), then
`feat/inventory-finance` from it. Before starting: `npm run db:snapshot` +
`npm run backup`. `npm run verify` after every commit.

1. **Phase 1 — critical and important fixes**, one commit each:
   - B1 (as decided)
   - I1, C1, C2
   - B3 (as decided)
   - B2, B4, I2, I3
   - then I4 and I5 as decided in the other plan.
2. **Phase 2 — inventory**, one commit per step:
   1. migrations and backfill;
   2. `postMovement` + weighted average cost + tests;
   3. recipes and optional option ingredients;
   4. order integration per site + idempotency;
   5. purchases, waste, stocktake;
   6. finance lines;
   7. reports and export;
   8. UI and permissions.
3. **Phase 3:**
   - Minor items (B5, C3, C4, C6, and the other plan's M-list).
   - Tests: deduction and reversal, idempotency, weighted average cost, unit
     conversion, COGS and gross profit, branch isolation.
   - Mobile RTL walk-through: create items → recipes → purchase → order →
     complete → cancel → waste → stocktake → check that stock, P&L and reports
     agree.
   - Final report appended here.

---

## Decisions I need from you

1. **The other plan's six decisions**, especially #1: commit the uncommitted
   v14 work on `main` first (after removing your real phone number from
   `scripts/assign-dev-phones.ts`), then branch.
2. **B1 — «مواد اولیه» expenses.** Recommended: rename the category to
   **«ملزومات مصرفی»** (napkins, cleaning, disposables) and record ingredients
   through purchases from now on. Existing expense rows stay as they are (no
   historical number changes), and a one-line note on the expense form explains
   where ingredients go. The alternative is to leave it, and the double count
   continues.
3. **B3 — unpaid online orders.** Options:
   - **(a) Recommended:** cancel an online order automatically when its payment
     fails or is not completed within N minutes (e.g. 15). Stock returns and
     revenue drops. It applies to new orders; the 46 existing ones would change
     39,060,000 Toman of revenue in the dev data, so I would only touch them
     after showing you the before/after.
   - **(b)** Let staff mark such an order «پرداخت در محل» (switch to cash).
   - **(c)** Both.
4. **Per-branch stock now?** The brief asks for it; today a chain shares one
   set of shelves on purpose. Recommended: yes (D.1 `StockLevel`). Only one
   chain exists and there are no real users yet, so this is the cheapest moment.
5. **COGS basis going forward.** Recommended: an order's cost snapshot uses the
   ingredients' **weighted average cost** once an item has at least one recorded
   purchase, and the reference price otherwise. The reference price keeps
   driving menu pricing and margin warnings. Past orders are unchanged.
6. **Negative stock:** keep "allow with a warning" (current, documented
   behaviour), or block orders when stock would go negative?
7. **B2:** OK to change the chain page's net profit so it matches each branch's
   own page?
8. **Options that consume ingredients** (e.g. «بزرگ» uses +100 g): include in
   this pass, or later?
