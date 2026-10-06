import "server-only";
import { prisma } from "./prisma";
import { netRevenue, type DateRange, businessDateFilter } from "./analytics";
import { COUNTED_ORDER } from "./order-status";
import { ratioDelta } from "./sales-insights";
import { NO_TABLE, tableViews } from "./menu-views";
import {
  buildTableReport,
  type ConfiguredTable,
  type TableOrderTotals,
  type TableReport,
} from "./tables";

/**
 * The database half of the table intelligence report.
 *
 * `tables.ts` decides what the figures mean; this only fetches them. The split
 * is the same one `profitability.ts` and `customers.ts` keep, and for the same
 * reason: the rules can then be tested without a database.
 *
 * ### Everything here is the branch's own
 *
 * A branch is a full tenant — its own `RestaurantTable` rows, its own orders,
 * its own menu-view counts — and none of this consults `menuOwnerId()`. That is
 * deliberate and it is what makes branch isolation free rather than enforced:
 * "table 1" at two branches of a chain are two `restaurantId` values that never
 * appear in the same query, so there is no code path along which one branch's
 * tables could be mistaken for another's.
 *
 * Contrast the merchandising reports on the analytics page, which *do* resolve
 * the menu owner because a promotion belongs to the chain. Tables do not.
 */

/**
 * One venue's order totals for a window, grouped by table number.
 *
 * Aggregated in the database rather than in JS, unlike the rest of
 * `analytics.ts`. That module reads a few thousand rows and folds them in
 * memory, which is right when four reports share one cached read — but this
 * question groups 12,000 orders down to about twenty rows, and shipping all
 * 12,000 into the process to count them would be the one thing §41 asks a
 * report of this shape not to do.
 *
 * Revenue is `netRevenue` applied to the summed columns, not a second
 * definition: the subtraction is linear, so summing `total - tax - tip` per
 * order and subtracting the summed columns give the same figure, and taking it
 * through the canonical function means a change there reaches this too.
 *
 * Orders with no table number are excluded rather than grouped under a blank —
 * a phone order or a counter sale is not a table's trade, and folding it into
 * one would credit an arbitrary table with it.
 */
export async function getTableOrderTotals(
  restaurantId: string,
  range: DateRange,
): Promise<TableOrderTotals[]> {
  const groups = await prisma.order.groupBy({
    by: ["tableNumber"],
    where: {
      restaurantId,
      ...COUNTED_ORDER,
      businessDate: businessDateFilter(range),
      tableNumber: { not: null },
    },
    _count: { _all: true },
    _sum: { total: true, tax: true, tip: true },
    _max: { placedAt: true },
  });

  const rows: TableOrderTotals[] = [];

  for (const group of groups) {
    const tableNumber = group.tableNumber?.trim();
    // `{ not: null }` does not exclude the empty string, and an order saved
    // with a blank table is not attributable to one.
    if (!tableNumber) continue;

    rows.push({
      tableNumber,
      orders: group._count._all,
      revenue: netRevenue({
        total: group._sum.total ?? 0,
        tax: group._sum.tax ?? 0,
        tip: group._sum.tip ?? 0,
      }),
      lastOrderAt: group._max.placedAt,
    });
  }

  return rows;
}

/** The venue's configured tables, in the order its own QR screen lists them. */
export async function getConfiguredTables(
  restaurantId: string,
): Promise<ConfiguredTable[]> {
  return prisma.restaurantTable.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "asc" },
    select: { id: true, number: true, label: true, seats: true },
  });
}

/**
 * The whole report for one venue over one comparison.
 *
 * Four reads, issued together: the table list, this window's orders, the
 * previous window's orders, and this window's menu opens. Every one of them is
 * scoped to `restaurantId`, which the caller has taken from the session and
 * never from a request.
 */
export async function getTableReport(
  restaurantId: string,
  windows: { current: DateRange; previous: DateRange },
): Promise<TableReport> {
  const [configured, current, previous, views] = await Promise.all([
    getConfiguredTables(restaurantId),
    getTableOrderTotals(restaurantId, windows.current),
    getTableOrderTotals(restaurantId, windows.previous),
    tableViews(restaurantId, windows.current),
  ]);

  return buildTableReport({
    configured,
    current,
    previous,
    views,
    untabledViewKey: NO_TABLE,
    // The platform's one definition of "how much did this move", handed in
    // rather than reached for — see `TableReportInput.delta`.
    delta: ratioDelta,
  });
}
