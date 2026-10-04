/**
 * A table's open tab: every order that table has placed recently and not yet
 * paid, gathered so the cashier can print one bill and settle it at once.
 *
 * Guests order in rounds through the table's QR code, and each round is its
 * own order. Without this the cashier adds them up by hand at the end.
 *
 * Pure — orders in, groups and sums out — so the arithmetic can be tested
 * without a database. `table-tab-server.ts` does the reading and writing.
 */
import { toEnglishDigits } from "./format";

/** How far back an unpaid order still belongs to the table's current tab. */
export const TAB_WINDOW_HOURS = 12;

export interface TabOrderItem {
  name: string;
  quantity: number;
  /** What the line came to, options included. */
  lineTotal: number;
  options: string[];
}

export interface TabOrder {
  id: string;
  orderNumber: number;
  tableNumber: string;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  placedAt: Date;
  subtotal: number;
  discount: number;
  serviceCharge: number;
  tax: number;
  tip: number;
  roundingAdjustment: number;
  total: number;
  items: TabOrderItem[];
}

export interface Tab {
  table: string;
  orders: TabOrder[];
  total: number;
  /** The guests at this table asked for the bill and nobody has answered yet. */
  billRequested: boolean;
  firstPlacedAt: Date;
}

/** «۷» and " 7 " are the same table. */
export function normaliseTable(value: string): string {
  return toEnglishDigits(value).trim();
}

/** Whether an order is still part of its table's open tab. */
export function isOpen(order: Pick<TabOrder, "status" | "paymentStatus">): boolean {
  return order.status !== "CANCELED" && order.paymentStatus !== "PAID";
}

/**
 * Open orders grouped by table, the tables in the order they sat down.
 * Tables with no open order are left out — a settled table is not "occupied".
 */
export function groupTabs(
  orders: readonly TabOrder[],
  billRequestedTables: ReadonlySet<string> = new Set(),
): Tab[] {
  const byTable = new Map<string, TabOrder[]>();
  for (const order of orders) {
    if (!isOpen(order)) continue;
    const table = normaliseTable(order.tableNumber);
    if (!table) continue;
    const list = byTable.get(table) ?? [];
    list.push(order);
    byTable.set(table, list);
  }

  return [...byTable.entries()]
    .map(([table, list]) => {
      const sorted = [...list].sort(
        (a, b) => a.placedAt.getTime() - b.placedAt.getTime(),
      );
      return {
        table,
        orders: sorted,
        total: sorted.reduce((sum, order) => sum + order.total, 0),
        billRequested: billRequestedTables.has(table),
        firstPlacedAt: sorted[0]!.placedAt,
      };
    })
    .sort((a, b) => a.firstPlacedAt.getTime() - b.firstPlacedAt.getTime());
}

export interface BillLine {
  name: string;
  options: string[];
  quantity: number;
  lineTotal: number;
}

/**
 * The same dish with the same choices, ordered in several rounds, becomes one
 * line on the bill: three rounds of «چای» read as «۳× چای», not three lines.
 * Lines merge only when the unit price is the same too, so a dish repriced
 * between rounds stays honest.
 */
export function mergeBillLines(orders: readonly TabOrder[]): BillLine[] {
  const merged = new Map<string, BillLine>();
  for (const order of orders) {
    for (const item of order.items) {
      const unit = item.quantity > 0 ? item.lineTotal / item.quantity : 0;
      const key = `${item.name}|${item.options.join("،")}|${unit}`;
      const existing = merged.get(key);
      if (existing) {
        existing.quantity += item.quantity;
        existing.lineTotal += item.lineTotal;
      } else {
        merged.set(key, {
          name: item.name,
          options: [...item.options],
          quantity: item.quantity,
          lineTotal: item.lineTotal,
        });
      }
    }
  }
  return [...merged.values()];
}

export interface BillTotals {
  subtotal: number;
  discount: number;
  serviceCharge: number;
  tax: number;
  tip: number;
  roundingAdjustment: number;
  total: number;
}

/** Each figure is the sum of the orders' own figures — nothing is recomputed. */
export function sumBill(orders: readonly TabOrder[]): BillTotals {
  const totals: BillTotals = {
    subtotal: 0,
    discount: 0,
    serviceCharge: 0,
    tax: 0,
    tip: 0,
    roundingAdjustment: 0,
    total: 0,
  };
  for (const order of orders) {
    totals.subtotal += order.subtotal;
    totals.discount += order.discount;
    totals.serviceCharge += order.serviceCharge;
    totals.tax += order.tax;
    totals.tip += order.tip;
    totals.roundingAdjustment += order.roundingAdjustment;
    totals.total += order.total;
  }
  return totals;
}
