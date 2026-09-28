import "server-only";
import { prisma } from "../prisma";
import {
  dayKey,
  getCategoryBreakdown,
  getFinanceSummary,
  getProductSales,
  getRangeSummary,
  resolveRange,
  type DateRange,
} from "../analytics";
import { rankPerformance } from "../profitability";
import { getTableReport } from "../tables-server";
import { listCustomers } from "../customers-server";
import { fromMilli, isLowStock } from "../inventory";
import { zonedParts } from "../time";
import type { ColumnKind, ExportColumn, ExportRow } from "./cells";
import { type ExportDataset } from "./dataset-names";
import type { Dictionary } from "../i18n/fa";

export { EXPORT_DATASETS, SENSITIVE_DATASETS, type ExportDataset } from "./dataset-names";

/**
 * What each export actually contains.
 *
 * **Every dataset here is a projection of a report that already exists.** None
 * of them computes revenue, cost, margin, a segment or a trading day; they call
 * the same providers the dashboard calls and rename the columns. That is the
 * entire design, and it is what stops the export and the screen disagreeing —
 * the failure mode that destroys trust in an export feature.
 *
 * The mapping, stated once:
 *
 * | Dataset       | Provider it projects                    |
 * | ------------- | --------------------------------------- |
 * | `sales`       | `getRangeSummary` (analytics.ts)        |
 * | `orders`      | `Order` rows, `netRevenue` definition   |
 * | `order-items` | `OrderItem` snapshots, historical       |
 * | `products`    | `rankPerformance` (Part 3)              |
 * | `categories`  | `getCategoryBreakdown` (analytics.ts)   |
 * | `customers`   | `listCustomers` (Part 2)                |
 * | `inventory`   | `InventoryItem` + `isLowStock`          |
 * | `pnl`         | `getFinanceSummary` (analytics.ts)      |
 * | `tables`      | `getTableReport` (Part 14)              |
 *
 * ### Money and dates
 *
 * Money is written as a bare integer of **Toman** — the platform's canonical
 * unit, unconverted — so the spreadsheet can add it up. The unit is stated in
 * the column header instead, which is the only place it can live without
 * breaking arithmetic.
 *
 * Dates are rendered through `zonedParts`, so a trading day in an export is the
 * same trading day the dashboard shows. A raw `toISOString()` would file the
 * last hours of every Tehran evening under the following day.
 */

/**
 * A dataset's columns — each with the *kind* of value it holds — and its rows.
 *
 * The kind is what lets the Excel writer format a Toman figure with thousands
 * separators and a share as a percentage without guessing from the header.
 */
export interface ExportResult {
  columns: ExportColumn[];
  rows: ExportRow[];
}

function col(header: string, kind: ColumnKind): ExportColumn {
  return { header, kind };
}

/**
 * «بله» / «خیر» rather than `TRUE`/`FALSE` or `1`/`0`.
 *
 * A boolean cell renders in Excel's own language, which on most machines is
 * English — the one English word in an otherwise Persian file.
 */
function yesNo(value: boolean, t: Dictionary): string {
  return value ? t.common.yes : t.common.no;
}

/** `2026-09-15` in the venue's own timezone, never the host's. */
function isoDay(instant: Date): string {
  const { year, month, day } = zonedParts(instant);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** `21:45` in the venue's own timezone. */
function clockTime(instant: Date): string {
  const { hour, minute } = zonedParts(instant);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Orders that count, matching `COUNTED` in analytics.ts and customers-server.ts.
 *
 * The order-level exports deliberately include cancelled orders and mark their
 * status, because an accountant reconciling a period needs to see what was
 * cancelled rather than have it silently absent. The *aggregate* exports
 * (`sales`, `pnl`, `products`) exclude them, because they project providers
 * that already exclude them — which is what keeps the totals reconciling with
 * the dashboard.
 */

// ------------------------------- the datasets ------------------------------

/**
 * Daily takings — the analytics page's trend chart, as rows.
 *
 * `getRangeSummary` already produces one bucket per trading day with revenue,
 * cost and order count, anchored to `APP_TIME_ZONE`. This renames its fields.
 */
async function salesDataset(
  restaurantId: string,
  range: DateRange,
  t: Dictionary,
): Promise<ExportResult> {
  const summary = await getRangeSummary(restaurantId, range);
  const e = t.exports.columns;

  return {
    columns: [
      col(e.date, "date"),
      col(e.revenue, "money"),
      col(e.cost, "money"),
      col(e.grossProfit, "money"),
      col(e.orders, "integer"),
      col(e.averageOrderValue, "money"),
    ],
    rows: summary.series.map((point) => [
      point.date,
      point.revenue,
      point.cost,
      point.revenue - point.cost,
      point.orders,
      point.orders > 0 ? Math.round(point.revenue / point.orders) : 0,
    ]),
  };
}

/**
 * One row per order.
 *
 * Reads the columns an accountant reconciles against and nothing else — no
 * `publicToken` (it authorises the guest's status page), no customer id, no
 * payment provider reference. `customerPhone` is deliberately absent too: the
 * customer export exists for that and is gated more tightly.
 */
async function ordersDataset(
  restaurantId: string,
  range: DateRange,
  t: Dictionary,
): Promise<ExportResult> {
  const orders = await prisma.order.findMany({
    where: { restaurantId, placedAt: { gte: range.from, lte: range.to } },
    orderBy: { placedAt: "asc" },
    select: {
      orderNumber: true,
      placedAt: true,
      status: true,
      paymentMethod: true,
      paymentStatus: true,
      tableNumber: true,
      subtotal: true,
      discount: true,
      serviceCharge: true,
      tax: true,
      tip: true,
      total: true,
      costTotal: true,
      restaurant: { select: { name: true } },
    },
  });

  const e = t.exports.columns;
  const v = t.exports.values;

  return {
    columns: [
      col(e.orderNumber, "id"),
      col(e.date, "date"),
      col(e.time, "time"),
      col(e.branch, "text"),
      col(e.table, "id"),
      col(e.status, "text"),
      col(e.paymentMethod, "text"),
      col(e.paymentStatus, "text"),
      col(e.subtotal, "money"),
      col(e.discount, "money"),
      col(e.serviceCharge, "money"),
      col(e.tax, "money"),
      col(e.tip, "money"),
      col(e.total, "money"),
      col(e.cost, "money"),
    ],
    rows: orders.map((order) => [
      order.orderNumber,
      isoDay(order.placedAt),
      clockTime(order.placedAt),
      order.restaurant.name,
      order.tableNumber,
      // Labels in the reader's language, not the stored codes.
      t.orderStatus[order.status],
      v.paymentMethod[order.paymentMethod],
      v.paymentStatus[order.paymentStatus],
      order.subtotal,
      order.discount,
      order.serviceCharge,
      order.tax,
      order.tip,
      order.total,
      order.costTotal,
    ]),
  };
}

/**
 * One row per ordered line — the deepest export, for real analysis.
 *
 * **Every figure comes from the order's own snapshots**, never from the
 * product's current price. That is not a detail: a dish repriced last week
 * would otherwise rewrite the whole of last month's history, and an export an
 * accountant cannot trust to be historically accurate is worse than none. The
 * name is snapshotted too, so a renamed or deleted dish still reads correctly.
 */
async function orderItemsDataset(
  restaurantId: string,
  range: DateRange,
  t: Dictionary,
): Promise<ExportResult> {
  const items = await prisma.orderItem.findMany({
    where: {
      order: { restaurantId, placedAt: { gte: range.from, lte: range.to } },
    },
    orderBy: [{ order: { placedAt: "asc" } }, { id: "asc" }],
    select: {
      nameSnapshot: true,
      priceSnapshot: true,
      costSnapshot: true,
      quantity: true,
      note: true,
      order: {
        select: { orderNumber: true, placedAt: true, status: true },
      },
      product: { select: { category: { select: { name: true } } } },
      options: {
        orderBy: { sortOrder: "asc" },
        select: { groupNameSnapshot: true, choiceNameSnapshot: true },
      },
    },
  });

  const e = t.exports.columns;

  return {
    columns: [
      col(e.orderNumber, "id"),
      col(e.date, "date"),
      col(e.status, "text"),
      col(e.product, "text"),
      col(e.category, "text"),
      col(e.options, "text"),
      col(e.quantity, "integer"),
      col(e.unitPrice, "money"),
      col(e.unitCost, "money"),
      col(e.lineTotal, "money"),
      col(e.note, "text"),
    ],
    rows: items.map((item) => [
      item.order.orderNumber,
      isoDay(item.order.placedAt),
      t.orderStatus[item.order.status],
      item.nameSnapshot,
      // Null once the product is deleted — the line keeps its own name, but the
      // category is only reachable through the product that no longer exists.
      item.product?.category.name ?? null,
      // The guest's choices, flattened. Snapshotted, so a renamed option still
      // reads as what they actually ordered.
      item.options
        .map((o) => `${o.groupNameSnapshot}: ${o.choiceNameSnapshot}`)
        .join(" | "),
      item.quantity,
      item.priceSnapshot,
      item.costSnapshot,
      item.priceSnapshot * item.quantity,
      item.note,
    ]),
  };
}

/**
 * Per-dish economics — Part 3's profitability table, as rows.
 *
 * Calls `rankPerformance` on `getProductSales`, which is exactly what the
 * analytics page does, so the margin in a cell is the margin on the screen.
 * The uncertainty handling is preserved rather than flattened: a dish with no
 * cost recorded exports an empty margin, not a zero, because zero would read as
 * "this dish earns nothing" when the truth is "we do not know".
 */
async function productsDataset(
  restaurantId: string,
  range: DateRange,
  t: Dictionary,
): Promise<ExportResult> {
  const sales = await getProductSales(restaurantId, range);
  const { rows, totalRevenue } = rankPerformance(sales);

  const e = t.exports.columns;

  return {
    columns: [
      col(e.product, "text"),
      col(e.quantity, "integer"),
      col(e.revenue, "money"),
      col(e.cost, "money"),
      col(e.grossProfit, "money"),
      col(e.margin, "percent"),
      col(e.revenueShare, "percent"),
      col(e.standing, "text"),
    ],
    rows: rows.map((row) => [
      row.name,
      row.quantity,
      row.revenue,
      row.hasCost ? row.cost : null,
      row.grossProfit,
      // A fraction, not a percentage string: the spreadsheet can format it as a
      // percentage itself, and can average the column.
      row.margin,
      totalRevenue > 0 ? row.revenue / totalRevenue : 0,
      t.analytics.quadrants[row.quadrant],
    ]),
  };
}

/** Category revenue — `getCategoryBreakdown`, as rows. */
async function categoriesDataset(
  restaurantId: string,
  range: DateRange,
  t: Dictionary,
): Promise<ExportResult> {
  const slices = await getCategoryBreakdown(restaurantId, range);
  const total = slices.reduce((sum, slice) => sum + slice.revenue, 0);

  const e = t.exports.columns;

  return {
    columns: [
      col(e.category, "text"),
      col(e.quantity, "integer"),
      col(e.revenue, "money"),
      col(e.revenueShare, "percent"),
    ],
    rows: slices.map((slice) => [
      slice.name,
      slice.quantity,
      slice.revenue,
      total > 0 ? slice.revenue / total : 0,
    ]),
  };
}

/**
 * The customer book — Part 2's `listCustomers`, as rows.
 *
 * The one export carrying personal data, and the reason `SENSITIVE_DATASETS`
 * exists. Every figure is Part 2's: the lifecycle segment, the typical return
 * interval and the lifetime value all come from `deriveCustomer`, so an owner
 * comparing this file with the customers screen sees the same answers.
 *
 * Deliberately unpaged. An export of "the first 25 customers" is not an export;
 * `listCustomers` derives the whole book in two queries regardless, so asking
 * for all of it costs nothing extra.
 */
async function customersDataset(
  restaurantId: string,
  _range: DateRange,
  t: Dictionary,
): Promise<ExportResult> {
  const { customers } = await listCustomers(restaurantId, { pageSize: 100, page: 1 });

  const e = t.exports.columns;

  return {
    columns: [
      col(e.customerName, "text"),
      /*
        The phone as text, not a number.

        `09121234567` parsed as a number loses its leading zero and becomes
        9121234567 — which is not a phone number and cannot be dialled. The
        `phone` kind makes the Excel cell text and gives the CSV its guard.
      */
      col(e.phone, "phone"),
      col(e.firstOrder, "date"),
      col(e.lastOrder, "date"),
      col(e.daysSinceLastOrder, "integer"),
      col(e.orders, "integer"),
      col(e.totalSpend, "money"),
      col(e.averageOrderValue, "money"),
      col(e.typicalInterval, "integer"),
      col(e.segment, "text"),
      col(e.valueTier, "text"),
      col(e.marketingConsent, "text"),
    ],
    rows: customers.map((customer) => [
      customer.name,
      customer.phone,
      customer.firstOrderAt ? isoDay(customer.firstOrderAt) : null,
      customer.lastOrderAt ? isoDay(customer.lastOrderAt) : null,
      customer.daysSinceLastOrder,
      customer.orderCount,
      customer.totalRevenue,
      customer.averageOrderValue,
      customer.typicalInterval,
      t.customers.segments[customer.segment],
      t.customers.valueTiers[customer.valueTier],
      yesNo(customer.marketingConsent, t),
    ]),
  };
}

/**
 * Stock on hand — the inventory screen, as rows.
 *
 * `fromMilli` and `isLowStock` are the platform's existing helpers: quantities
 * are stored in thousandths and the low-stock rule is one function the
 * dashboard already uses. Neither is restated here.
 *
 * Not range-filtered, because stock is a level rather than a flow — "inventory
 * between the 1st and the 15th" is not a question with an answer.
 */
async function inventoryDataset(
  restaurantId: string,
  _range: DateRange,
  t: Dictionary,
): Promise<ExportResult> {
  const items = await prisma.inventoryItem.findMany({
    where: { restaurantId },
    orderBy: { name: "asc" },
    select: {
      name: true,
      unit: true,
      quantityMilli: true,
      lowStockMilli: true,
      isActive: true,
    },
  });

  const e = t.exports.columns;

  return {
    columns: [
      col(e.item, "text"),
      col(e.unit, "text"),
      col(e.inStock, "quantity"),
      col(e.lowStockAt, "quantity"),
      col(e.isLow, "text"),
      col(e.active, "text"),
    ],
    rows: items.map((item) => [
      item.name,
      // The label in the reader's language, not the stored code.
      t.costing.units[item.unit as keyof typeof t.costing.units] ?? item.unit,
      fromMilli(item.quantityMilli),
      fromMilli(item.lowStockMilli),
      yesNo(isLowStock(item), t),
      yesNo(item.isActive, t),
    ]),
  };
}

/**
 * The profit and loss — `getFinanceSummary`, as rows.
 *
 * A narrow, labelled two-column shape rather than one wide row, because a P&L
 * is read down the page and because the expense breakdown has a variable number
 * of lines. Every figure is the finance page's own.
 */
async function pnlDataset(
  restaurantId: string,
  range: DateRange,
  t: Dictionary,
): Promise<ExportResult> {
  const finance = await getFinanceSummary(restaurantId, range);
  const e = t.exports.columns;
  const f = t.finance;

  // The finance page's own labels, so a line in the file reads as the line on
  // the screen rather than as a second vocabulary for the same figures.
  const rows: ExportRow[] = [
    [f.totalRevenue, finance.revenue],
    [f.totalCost, finance.cost],
    [f.grossProfit, finance.grossProfit],
    [f.totalExpenses, finance.expenses],
    [finance.netProfit < 0 ? f.netLoss : f.netProfit, finance.netProfit],
    // The one line in the amount column that is not Toman.
    [f.margin, { value: finance.margin, kind: "percent" }],
  ];

  // The expense breakdown, attributed under its total by naming rather than by
  // formatting — a CSV has no indentation, so the label carries it.
  for (const line of finance.expensesByCategory) {
    // The finance page's label for a built-in category; an owner's own
    // category is printed as they wrote it.
    const label =
      f.categories[line.category as keyof typeof f.categories] ?? line.category;
    rows.push([`${f.totalExpenses}: ${label}`, line.amount]);
  }

  return { columns: [col(e.item, "text"), col(e.amount, "money")], rows };
}

// -------------------------------- dispatch ---------------------------------

type Builder = (
  restaurantId: string,
  range: DateRange,
  t: Dictionary,
) => Promise<ExportResult>;

/**
 * Table performance — Part 14's `getTableReport`, as rows.
 *
 * A projection like every other builder here: it calls the same function the
 * screen calls and renames the columns. Nothing about a table's revenue, its
 * activity band or its visit ratio is re-derived, so the file and the page
 * cannot disagree.
 *
 * The comparison window is the previous period of equal length, which is what
 * `resolveRange` hands every export. That makes the trend columns mean the same
 * thing here as on the analytics screens, and the whole file describes exactly
 * the period the owner chose.
 *
 * Visit columns are written as empty cells rather than zeros when the platform
 * could not attribute a venue's traffic to tables. A zero in a spreadsheet is a
 * measurement; a blank is the absence of one, and they must not be confused
 * when somebody sums the column.
 */
async function tablesDataset(
  restaurantId: string,
  range: DateRange,
  t: Dictionary,
): Promise<ExportResult> {
  const span = range.to.getTime() - range.from.getTime();
  const report = await getTableReport(restaurantId, {
    current: range,
    previous: {
      from: new Date(range.from.getTime() - span),
      to: new Date(range.from.getTime() - 1),
    },
  });

  const e = t.exports.columns;
  const measured = report.views.status === "measured";

  return {
    columns: [
      col(e.table, "id"),
      col(e.tableLabel, "text"),
      col(e.orders, "integer"),
      col(e.revenue, "money"),
      col(e.averageOrderValue, "money"),
      col(e.menuVisits, "integer"),
      col(e.ordersPerVisit, "ratio"),
      col(e.revenueShare, "percent"),
      col(e.tableActivity, "text"),
      col(e.lastOrder, "date"),
    ],
    rows: report.rows.map((row) => [
      row.number,
      row.label ?? "",
      row.orders,
      row.revenue,
      row.averageOrderValue,
      measured ? row.visits.views : "",
      row.visits.ratio ?? "",
      row.revenueShare,
      row.activity ? t.tableIntel.activity[row.activity] : "",
      row.lastOrderAt ? dayKey(row.lastOrderAt) : "",
    ]),
  };
}

const BUILDERS: Record<ExportDataset, Builder> = {
  sales: salesDataset,
  orders: ordersDataset,
  "order-items": orderItemsDataset,
  products: productsDataset,
  categories: categoriesDataset,
  customers: customersDataset,
  inventory: inventoryDataset,
  pnl: pnlDataset,
  tables: tablesDataset,
};

/**
 * Builds one export.
 *
 * `restaurantId` arrives from the session — the route resolves it and there is
 * no parameter here a caller could point elsewhere. Every query below filters
 * on it, so a dataset cannot read across tenants even by mistake.
 *
 * The window is resolved through `resolveRange`, the same function every report
 * uses, so "the last 30 days" means the same 30 trading days in a file as it
 * does on a screen.
 */
export async function buildExport(
  dataset: ExportDataset,
  restaurantId: string,
  window: number | DateRange,
  t: Dictionary,
): Promise<ExportResult> {
  return BUILDERS[dataset](restaurantId, resolveRange(window), t);
}

/** The day an export was taken, for its filename. Venue time, not host time. */
export function exportDayKey(): string {
  return dayKey(new Date());
}
