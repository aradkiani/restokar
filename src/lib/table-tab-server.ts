import "server-only";
import { prisma } from "./prisma";
import { markOrderPaid } from "./orders";
import { recordAudit } from "./audit";
import { HttpError } from "./auth/guards";
import { staffCallVisibleSince } from "./constants";
import { formatMoney } from "./format";
import type { SessionUser } from "./auth/session";
import {
  TAB_WINDOW_HOURS,
  groupTabs,
  isOpen,
  normaliseTable,
  type Tab,
  type TabOrder,
} from "./table-tab";

/**
 * Reading and settling tables' open tabs. The rules — what counts as open, how
 * a bill is summed — are in `table-tab.ts`; payment goes through
 * `markOrderPaid`, the same function the board's paid button uses.
 */

const tabSelect = {
  id: true,
  orderNumber: true,
  tableNumber: true,
  paymentMethod: true,
  paymentStatus: true,
  status: true,
  placedAt: true,
  subtotal: true,
  discount: true,
  serviceCharge: true,
  tax: true,
  tip: true,
  roundingAdjustment: true,
  total: true,
  items: {
    orderBy: { id: "asc" },
    select: {
      nameSnapshot: true,
      priceSnapshot: true,
      quantity: true,
      options: {
        orderBy: { sortOrder: "asc" },
        select: { choiceNameSnapshot: true },
      },
    },
  },
} as const;

async function recentOpenOrders(siteId: string): Promise<TabOrder[]> {
  const since = new Date(Date.now() - TAB_WINDOW_HOURS * 3_600_000);
  const rows = await prisma.order.findMany({
    where: {
      restaurantId: siteId,
      tableNumber: { not: null },
      placedAt: { gte: since },
      status: { not: "CANCELED" },
      paymentStatus: { not: "PAID" },
    },
    orderBy: { placedAt: "asc" },
    take: 500,
    select: tabSelect,
  });
  return rows.map((row) => ({
    ...row,
    tableNumber: row.tableNumber ?? "",
    items: row.items.map((item) => ({
      name: item.nameSnapshot,
      quantity: item.quantity,
      lineTotal: item.priceSnapshot * item.quantity,
      options: item.options.map((option) => option.choiceNameSnapshot),
    })),
  }));
}

async function billRequestedTables(siteId: string): Promise<Set<string>> {
  const calls = await prisma.staffCall.findMany({
    where: {
      restaurantId: siteId,
      kind: "BILL",
      acknowledgedAt: null,
      createdAt: { gte: staffCallVisibleSince() },
    },
    select: { tableNumber: true },
  });
  return new Set(calls.map((call) => normaliseTable(call.tableNumber)));
}

/** Every table with an open tab right now. */
export async function openTabs(siteId: string): Promise<Tab[]> {
  const [orders, requested] = await Promise.all([
    recentOpenOrders(siteId),
    billRequestedTables(siteId),
  ]);
  return groupTabs(orders, requested);
}

/** One table's open tab, or null when it has nothing open. */
export async function tableTab(siteId: string, table: string): Promise<Tab | null> {
  const wanted = normaliseTable(table);
  const tabs = await openTabs(siteId);
  return tabs.find((tab) => tab.table === wanted) ?? null;
}

/**
 * Marks every open order on a table as paid in cash.
 *
 * Order by order through `markOrderPaid`, so each one is checked exactly as a
 * tap on the board would be (an unpaid online order is settled as cash, as
 * there). Answers the table's open bill request, and is audited once with the
 * amount.
 */
export async function settleTable(args: {
  siteId: string;
  table: string;
  user: SessionUser;
  ip: string | null;
}): Promise<{ settled: number; total: number }> {
  const tab = await tableTab(args.siteId, args.table);
  if (!tab) throw new HttpError(404, "This table has nothing open", "TABLE_NOT_OPEN");

  let settled = 0;
  let total = 0;
  for (const order of tab.orders) {
    if (!isOpen(order)) continue;
    await markOrderPaid(args.siteId, order.id, true);
    settled += 1;
    total += order.total;
  }

  await prisma.staffCall.updateMany({
    where: {
      restaurantId: args.siteId,
      kind: "BILL",
      acknowledgedAt: null,
      tableNumber: { in: [...new Set([tab.table, args.table])] },
    },
    data: { acknowledgedAt: new Date() },
  });

  await recordAudit({
    actor: args.user,
    restaurantId: args.siteId,
    action: "TABLE_SETTLED",
    summary: `میز ${tab.table} نقدی تسویه شد — ${settled.toLocaleString("fa-IR")} سفارش، ${formatMoney(total)} تومان`,
    entityType: "Table",
    entityId: tab.table,
    metadata: { orderIds: tab.orders.map((order) => order.id), total },
    ip: args.ip,
  });

  return { settled, total };
}
