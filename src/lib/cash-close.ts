/**
 * The end-of-day cash close: what the day's orders say the till should hold,
 * against what the cashier counts.
 *
 * Pure — orders in, figures out — so the arithmetic a cashier is judged by is
 * tested on its own. `cash-close-server.ts` reads the day and stores the close.
 */
import { startOfDayInZone, zonedMidnight, zonedParts } from "./time";

export interface CloseOrder {
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  total: number;
  discount: number;
  tip: number;
  tax: number;
  serviceCharge: number;
  refundedAt: Date | null;
}

export interface DaySummary {
  /** Orders that were not cancelled. */
  orders: number;
  /** What those orders came to, everything included. */
  sales: number;
  /** Paid in cash at the venue. */
  cashPaid: number;
  /** Paid online through the gateway. */
  onlinePaid: number;
  /** Not cancelled and not yet paid — money still to collect. */
  unpaidCount: number;
  unpaidTotal: number;
  canceledCount: number;
  canceledTotal: number;
  /** Cancelled after being paid, and not yet given back. */
  refundsDueCount: number;
  refundsDueTotal: number;
  discounts: number;
  tips: number;
  tax: number;
  serviceCharge: number;
  /**
   * What the drawer should hold: cash taken for orders that stand, plus cash
   * taken for orders cancelled since and not refunded yet — that money is
   * still physically in the till until it is handed back.
   */
  expectedCash: number;
}

export function summariseDay(orders: readonly CloseOrder[]): DaySummary {
  const summary: DaySummary = {
    orders: 0,
    sales: 0,
    cashPaid: 0,
    onlinePaid: 0,
    unpaidCount: 0,
    unpaidTotal: 0,
    canceledCount: 0,
    canceledTotal: 0,
    refundsDueCount: 0,
    refundsDueTotal: 0,
    discounts: 0,
    tips: 0,
    tax: 0,
    serviceCharge: 0,
    expectedCash: 0,
  };

  for (const order of orders) {
    const paid = order.paymentStatus === "PAID";
    const cash = order.paymentMethod === "CASH_ON_SITE";

    if (order.status === "CANCELED") {
      summary.canceledCount += 1;
      summary.canceledTotal += order.total;
      if (paid && order.refundedAt === null) {
        summary.refundsDueCount += 1;
        summary.refundsDueTotal += order.total;
        if (cash) summary.expectedCash += order.total;
      }
      continue;
    }

    summary.orders += 1;
    summary.sales += order.total;
    summary.discounts += order.discount;
    summary.tips += order.tip;
    summary.tax += order.tax;
    summary.serviceCharge += order.serviceCharge;

    if (!paid) {
      summary.unpaidCount += 1;
      summary.unpaidTotal += order.total;
    } else if (cash) {
      summary.cashPaid += order.total;
      summary.expectedCash += order.total;
    } else {
      summary.onlinePaid += order.total;
    }
  }

  return summary;
}

// ----------------------------------------------------------------- the day

/** A trading day as `YYYY-MM-DD` (Gregorian, in the venue's zone). */
export function dayKey(instant: Date): string {
  const p = zonedParts(instant);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/**
 * The start of the day a `?day=` value names, or of today when it is missing
 * or malformed. A day in the future is pulled back to today: there is nothing
 * to close there yet.
 */
export function dayStart(
  value: string | undefined,
  now: Date = new Date(),
  businessToday?: Date,
): Date {
  // The site's business today when known: at 01:00 in a café open until 03:00
  // the day to close is still this evening's.
  const today = businessToday ?? startOfDayInZone(now);
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return today;
  const start = zonedMidnight(Number(match[1]), Number(match[2]), Number(match[3]));
  return start.getTime() > today.getTime() ? today : start;
}

/** The day before or after, as a `?day=` value. */
export function shiftDay(start: Date, days: number): string {
  return dayKey(startOfDayInZone(new Date(start.getTime() + 12 * 3_600_000), days));
}
