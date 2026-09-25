import "server-only";
import { cache } from "react";
import { prisma } from "./prisma";
import { endOfDayInZone, startOfDayInZone, zonedParts } from "./time";
import { COUNTED_ORDER } from "./order-status";

/**
 * Reporting for a single tenant. Every function takes `restaurantId` as its
 * first argument and passes it into the `where` clause — there is no code path
 * here that can read across restaurants.
 *
 * Aggregation happens in JS after a narrow, indexed range query rather than in
 * raw SQL. At the scale of one venue's order history (thousands of rows per
 * month) this is comfortably fast, keeps the code portable, and avoids
 * hand-written SQL that would bypass Prisma's tenant scoping.
 */

/** Cancelled orders are excluded from every revenue figure. */
const COUNTED = COUNTED_ORDER;

export interface DayPoint {
  date: string; // ISO yyyy-mm-dd
  revenue: number;
  cost: number;
  orders: number;
}

export interface RangeSummary {
  revenue: number;
  cost: number;
  grossProfit: number;
  orders: number;
  averageOrderValue: number;
  series: DayPoint[];
}

/**
 * Boundaries of a venue's trading day.
 *
 * Both delegate to `src/lib/time.ts`, which anchors the day to
 * `APP_TIME_ZONE` instead of to the host's. These used to call `setHours`,
 * which reads whatever zone the process was started in — correct on a machine
 * set to Tehran, and 3½ hours out on a VPS left at UTC, where it filed the last
 * hours of every evening service under the following day.
 *
 * Kept as named functions here rather than replaced at the call sites: every
 * reporting layer already imports `startOfDay` from this module, and the fix
 * belongs behind that name rather than in a dozen callers.
 */
export function startOfDay(date: Date): Date {
  return startOfDayInZone(date);
}

function endOfDay(date: Date): Date {
  return endOfDayInZone(date);
}

/** An explicit reporting window, inclusive of both ends. */
export interface DateRange {
  from: Date;
  to: Date;
}

/**
 * Every reporting function accepts either a rolling window (`30` = last 30
 * days, which is what the dashboards use) or an explicit range (which is what
 * the report generator needs for "March 1 → March 31").
 *
 * Normalising here rather than duplicating the reporting queries means the PDF
 * and the on-screen dashboards are guaranteed to agree — the same code produces
 * both, so they cannot drift apart.
 */
export function resolveRange(window: number | DateRange): DateRange {
  if (typeof window !== "number") {
    return { from: startOfDay(window.from), to: endOfDay(window.to) };
  }
  // Counted back in whole zone days rather than by mutating the date, so a
  // rolling window lands on the same wall-clock midnight on every host.
  const now = new Date();
  return { from: startOfDayInZone(now, -(window - 1)), to: endOfDay(now) };
}

/**
 * Whole days spanned by a range, inclusive of both ends.
 *
 * Floors rather than rounds because `to` is normally the *end* of its day
 * (23:59:59.999). Rounding turned March — 30 days and 23:59:59.999 — into 32,
 * which seeded one bucket too many and put a phantom April 1 column on the end
 * of every monthly chart.
 */
export function rangeLengthInDays({ from, to }: DateRange): number {
  return Math.max(1, Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1);
}

/**
 * Per-request reads of the two tables every report is built from.
 *
 * A single analytics page asks for a range summary, an hourly distribution, a
 * top-products list and a category breakdown — which was four queries over two
 * row sets that are identical for a given window. Wrapping the reads in
 * `cache()` collapses them to two: the first caller pays for the query, the
 * rest are served from the request's memo table.
 *
 * Keyed on epoch milliseconds rather than `Date` objects, because `cache()`
 * compares arguments by identity and every `resolveRange` call builds new ones.
 *
 * The item select is the union of what its two consumers need, so one read
 * satisfies both rather than each issuing its own narrower query.
 */
const loadOrders = cache(async (restaurantId: string, fromMs: number, toMs: number) =>
  prisma.order.findMany({
    where: {
      restaurantId,
      ...COUNTED,
      placedAt: { gte: new Date(fromMs), lte: new Date(toMs) },
    },
    select: { placedAt: true, total: true, costTotal: true, tax: true, tip: true },
  }),
);

/**
 * What the venue actually earned on an order.
 *
 * `total` is what the guest paid, which is the right figure for a receipt but
 * the wrong one for a revenue report: collected tax is owed to the government
 * and a tip belongs to the staff. Counting either as revenue would overstate
 * turnover and, because neither has a matching cost, invent profit that does
 * not exist. Both columns are zero on every order placed before these options
 * existed, so historical figures are unchanged.
 */
export function netRevenue(order: { total: number; tax: number; tip: number }): number {
  return order.total - order.tax - order.tip;
}

const loadOrderItems = cache(async (restaurantId: string, fromMs: number, toMs: number) =>
  prisma.orderItem.findMany({
    where: {
      order: {
        restaurantId,
        ...COUNTED,
        placedAt: { gte: new Date(fromMs), lte: new Date(toMs) },
      },
    },
    select: {
      productId: true,
      nameSnapshot: true,
      priceSnapshot: true,
      costSnapshot: true,
      quantity: true,
      product: { select: { categoryId: true, category: { select: { name: true } } } },
    },
  }),
);

/**
 * Which of the venue's calendar days an instant belongs to.
 *
 * Read in `APP_TIME_ZONE`, not on the host clock. This used to use
 * `getFullYear/getMonth/getDate`, which agree with the zone only when the
 * process happens to have been started in it — true on the Tehran dev box and
 * false on a UTC VPS, where every instant between midnight and 03:30 Tehran was
 * filed under the previous day.
 *
 * The damage was worse than a mislabelled row. `resolveRange` has been
 * zone-anchored since the timezone pass, so the buckets were *seeded* from
 * zone-anchored midnights and the orders were *filed* by host date: on a UTC
 * host the two disagreed, and a day's takings landed in a bucket the chart had
 * never created. Exported so the contract is pinned by `analytics.test.ts`,
 * which fails against the old implementation under `TZ=UTC`.
 */
export function dayKey(date: Date): string {
  const p = zonedParts(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export async function getRangeSummary(
  restaurantId: string,
  window: number | DateRange,
): Promise<RangeSummary> {
  const { from, to } = resolveRange(window);
  const days = rangeLengthInDays({ from, to });

  const orders = await loadOrders(restaurantId, from.getTime(), to.getTime());

  // Seed every day in the window so gaps render as zero rather than vanishing
  // from the chart and distorting the trend.
  const buckets = new Map<string, DayPoint>();
  for (let i = 0; i < days; i++) {
    // Stepped in whole zone days rather than by mutating the date, for the same
    // reason `resolveRange` counts back that way: `setDate` walks the host's
    // calendar, which is not the venue's on a server left at UTC.
    const key = dayKey(startOfDayInZone(from, i));
    buckets.set(key, { date: key, revenue: 0, cost: 0, orders: 0 });
  }

  for (const order of orders) {
    const bucket = buckets.get(dayKey(order.placedAt));
    if (!bucket) continue;
    bucket.revenue += netRevenue(order);
    bucket.cost += order.costTotal;
    bucket.orders += 1;
  }

  const series = [...buckets.values()];
  const revenue = series.reduce((sum, p) => sum + p.revenue, 0);
  const cost = series.reduce((sum, p) => sum + p.cost, 0);
  const count = series.reduce((sum, p) => sum + p.orders, 0);

  return {
    revenue,
    cost,
    grossProfit: revenue - cost,
    orders: count,
    averageOrderValue: count > 0 ? Math.round(revenue / count) : 0,
    series,
  };
}

export interface TopProduct {
  productId: string | null;
  name: string;
  quantity: number;
  revenue: number;
  profit: number;
}

export async function getTopProducts(
  restaurantId: string,
  window: number | DateRange,
  limit = 8,
): Promise<TopProduct[]> {
  const { from, to } = resolveRange(window);

  const items = await loadOrderItems(restaurantId, from.getTime(), to.getTime());

  // Group by product where possible, falling back to the name snapshot so
  // deleted products still show up in history rather than collapsing together.
  const grouped = new Map<string, TopProduct>();

  for (const item of items) {
    const key = item.productId ?? `deleted:${item.nameSnapshot}`;
    const entry = grouped.get(key) ?? {
      productId: item.productId,
      name: item.nameSnapshot,
      quantity: 0,
      revenue: 0,
      profit: 0,
    };
    entry.quantity += item.quantity;
    entry.revenue += item.priceSnapshot * item.quantity;
    entry.profit += (item.priceSnapshot - item.costSnapshot) * item.quantity;
    grouped.set(key, entry);
  }

  return [...grouped.values()].sort((a, b) => b.quantity - a.quantity).slice(0, limit);
}

/**
 * Per-dish realised economics for a window: what it sold for, what it cost.
 *
 * A sibling of `getTopProducts` rather than a replacement — that function
 * answers "what sold most" and is ranked and capped for a leaderboard, while
 * this returns the whole menu unranked because the profitability layer has to
 * see every dish to work out what the menu's own margin is.
 *
 * Both read the same request-cached `loadOrderItems`, so calling both on one
 * page costs one query rather than two.
 *
 * ### `hasCost` is the load-bearing field
 *
 * `costSnapshot` is zero both for a dish that genuinely costs nothing and for
 * one whose owner never entered a cost — and the platform has exactly one cost
 * input (`Product.costPrice`; `InventoryItem` carries no price, so recipes
 * cannot supply one). Treating an uncosted dish as zero-cost reports a 100%
 * margin on it and silently inflates the menu average that every other dish is
 * judged against. So a dish is treated as costed only if at least one of its
 * sales carried a non-zero cost, and `profitability.ts` refuses to compute a
 * margin without it.
 */
export interface ProductSalesRow {
  key: string;
  id: string | null;
  name: string;
  quantity: number;
  revenue: number;
  cost: number;
  hasCost: boolean;
}

export async function getProductSales(
  restaurantId: string,
  window: number | DateRange,
): Promise<ProductSalesRow[]> {
  const { from, to } = resolveRange(window);

  const items = await loadOrderItems(restaurantId, from.getTime(), to.getTime());

  const grouped = new Map<string, ProductSalesRow>();

  for (const item of items) {
    // Same key as `getTopProducts`, so a deleted dish groups identically on
    // both screens rather than appearing once per name in one and not the other.
    const key = item.productId ?? `deleted:${item.nameSnapshot}`;
    const entry = grouped.get(key) ?? {
      key,
      id: item.productId,
      name: item.nameSnapshot,
      quantity: 0,
      revenue: 0,
      cost: 0,
      hasCost: false,
    };

    entry.quantity += item.quantity;
    entry.revenue += item.priceSnapshot * item.quantity;
    entry.cost += item.costSnapshot * item.quantity;
    if (item.costSnapshot > 0) entry.hasCost = true;

    grouped.set(key, entry);
  }

  return [...grouped.values()];
}

export interface CategorySlice {
  categoryId: string;
  name: string;
  revenue: number;
  quantity: number;
}

export async function getCategoryBreakdown(
  restaurantId: string,
  window: number | DateRange,
): Promise<CategorySlice[]> {
  const { from, to } = resolveRange(window);

  const items = await loadOrderItems(restaurantId, from.getTime(), to.getTime());

  const grouped = new Map<string, CategorySlice>();

  for (const item of items) {
    // Items whose product was deleted no longer have a category.
    if (!item.product) continue;
    const { categoryId, category } = item.product;
    const entry = grouped.get(categoryId) ?? {
      categoryId,
      name: category.name,
      revenue: 0,
      quantity: 0,
    };
    entry.revenue += item.priceSnapshot * item.quantity;
    entry.quantity += item.quantity;
    grouped.set(categoryId, entry);
  }

  return [...grouped.values()].sort((a, b) => b.revenue - a.revenue);
}

/** Orders per hour of day — tells an owner when to roster staff. */
export async function getHourlyDistribution(
  restaurantId: string,
  window: number | DateRange,
): Promise<{ hour: number; orders: number }[]> {
  const { from, to } = resolveRange(window);

  const orders = await loadOrders(restaurantId, from.getTime(), to.getTime());

  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0 }));
  // The venue's wall clock, not the host's — "we are busiest at 21:00" has to
  // mean 21:00 in the restaurant, whatever zone the server was started in.
  for (const order of orders) hours[zonedParts(order.placedAt).hour]!.orders += 1;

  return hours;
}

export interface TodayStats {
  revenue: number;
  orders: number;
  openOrders: number;
  averageOrderValue: number;
}

export async function getTodayStats(restaurantId: string): Promise<TodayStats> {
  // Deliberately open-ended: "today" runs from midnight to now, and an order
  // placed a second from now still belongs to today's takings.
  const from = startOfDay(new Date());

  const [aggregate, openOrders] = await Promise.all([
    prisma.order.aggregate({
      where: { restaurantId, ...COUNTED, placedAt: { gte: from } },
      _sum: { total: true, tax: true, tip: true },
      _count: true,
    }),
    prisma.order.count({
      where: { restaurantId, status: { in: ["RECEIVED", "PREPARING", "READY"] } },
    }),
  ]);

  const revenue = netRevenue({
    total: aggregate._sum.total ?? 0,
    tax: aggregate._sum.tax ?? 0,
    tip: aggregate._sum.tip ?? 0,
  });
  const orders = aggregate._count;

  return {
    revenue,
    orders,
    openOrders,
    averageOrderValue: orders > 0 ? Math.round(revenue / orders) : 0,
  };
}

export interface FinanceSummary {
  revenue: number;
  cost: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  margin: number;
  expensesByCategory: { category: string; amount: number }[];
}

/**
 * The full P&L view: gross profit from order snapshots, minus operating
 * expenses the owner records. Net profit can legitimately be negative — the
 * dashboard shows it as a loss rather than clamping it to zero.
 */
export async function getFinanceSummary(
  restaurantId: string,
  window: number | DateRange,
): Promise<FinanceSummary> {
  const { from, to } = resolveRange(window);

  const [orders, expenses] = await Promise.all([
    prisma.order.aggregate({
      where: { restaurantId, ...COUNTED, placedAt: { gte: from, lte: to } },
      _sum: { total: true, costTotal: true, tax: true, tip: true },
    }),
    prisma.expense.findMany({
      where: { restaurantId, occurredAt: { gte: from, lte: to } },
      select: { category: true, amount: true },
    }),
  ]);

  const revenue = netRevenue({
    total: orders._sum.total ?? 0,
    tax: orders._sum.tax ?? 0,
    tip: orders._sum.tip ?? 0,
  });
  const cost = orders._sum.costTotal ?? 0;
  const grossProfit = revenue - cost;

  const byCategory = new Map<string, number>();
  let expenseTotal = 0;
  for (const expense of expenses) {
    expenseTotal += expense.amount;
    byCategory.set(
      expense.category,
      (byCategory.get(expense.category) ?? 0) + expense.amount,
    );
  }

  const netProfit = grossProfit - expenseTotal;

  return {
    revenue,
    cost,
    grossProfit,
    expenses: expenseTotal,
    netProfit,
    margin: revenue > 0 ? netProfit / revenue : 0,
    expensesByCategory: [...byCategory.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
  };
}

/** Per-product unit economics for the finance table. */
export async function getProductProfitability(
  restaurantId: string,
  window: number | DateRange,
) {
  const [products, sold] = await Promise.all([
    prisma.product.findMany({
      where: { restaurantId },
      select: { id: true, name: true, price: true, costPrice: true },
      orderBy: { name: "asc" },
    }),
    getTopProducts(restaurantId, window, 1000),
  ]);

  const soldById = new Map(sold.filter((s) => s.productId).map((s) => [s.productId!, s]));

  return products.map((product) => {
    const stats = soldById.get(product.id);
    const unitProfit = product.price - product.costPrice;
    return {
      id: product.id,
      name: product.name,
      price: product.price,
      costPrice: product.costPrice,
      unitProfit,
      margin: product.price > 0 ? unitProfit / product.price : 0,
      quantitySold: stats?.quantity ?? 0,
      totalProfit: stats?.profit ?? 0,
      hasCost: product.costPrice > 0,
    };
  });
}
