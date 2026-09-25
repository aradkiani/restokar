/**
 * When a finished order leaves the kitchen board.
 *
 * The board is a work queue, not a ledger: once an order is handed over *and*
 * settled there is nothing left to do with it, and leaving it there buries the
 * orders that still need attention. Retiring it is a display decision — the row
 * is never touched, so history, revenue and every report keep it.
 *
 * ### Two conditions, in either order
 *
 * **Delivered and paid.** Those are independent events that happen in whichever
 * order the venue works in: a guest paying online settles before the food
 * arrives, while a cash bill is usually settled after. So the clock starts at
 * whichever came *last*, which is what `settledAt` returns.
 *
 * **An unpaid order never retires**, however long ago it was delivered. The
 * previous rule measured from delivery alone, which meant an order that was
 * handed over and never paid for disappeared from the pass after ninety
 * minutes — the one case where the board is the only thing standing between a
 * venue and a bill walking out of the door.
 *
 * Free of database and framework imports, so the server's query filter and the
 * board's own live re-filter can be checked against the same rule rather than
 * each implementing it.
 */

/** How long a delivered, paid order stays on the board. */
export const FINISHED_ORDER_VISIBLE_MINUTES = 60;
export const FINISHED_ORDER_VISIBLE_MS = FINISHED_ORDER_VISIBLE_MINUTES * 60_000;

/** The moment a finished order became both delivered and paid. */
export interface RetirableOrder {
  status: string;
  paymentStatus: string;
  deliveredAt: Date | string | null;
  paidAt: Date | string | null;
}

const asTime = (value: Date | string | null): number | null => {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
};

/**
 * When the order became finished, or null if it is not finished yet.
 *
 * The *later* of the two timestamps. Taking the earlier one would start the
 * hour before the order was actually done — an online order paid at 19:00 and
 * delivered at 19:50 would vanish ten minutes after it reached the pass.
 */
export function settledAt(order: RetirableOrder): number | null {
  if (order.status !== "DELIVERED") return null;
  if (order.paymentStatus !== "PAID") return null;

  const delivered = asTime(order.deliveredAt);
  const paid = asTime(order.paidAt);

  // A paid order with no timestamp predates the column. Treat it as settled
  // long ago rather than as never settled, so historical rows do not pin
  // themselves to the board forever.
  if (delivered === null && paid === null) return 0;
  if (delivered === null) return paid;
  if (paid === null) return delivered;

  return Math.max(delivered, paid);
}

/** Whether the board should still show this order. */
export function isRetired(order: RetirableOrder, now: number): boolean {
  const settled = settledAt(order);
  if (settled === null) return false;

  return now - settled >= FINISHED_ORDER_VISIBLE_MS;
}

/**
 * The cutoff a finished order's timestamps are compared against.
 *
 * A function rather than an inline `Date.now()` at the call site: reading the
 * clock during render is what `react-hooks/purity` forbids, and every other
 * window in this codebase is derived the same way.
 */
export function finishedVisibleSince(now: number = Date.now()): Date {
  return new Date(now - FINISHED_ORDER_VISIBLE_MS);
}
