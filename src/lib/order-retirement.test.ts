import { describe, expect, it } from "vitest";
import {
  FINISHED_ORDER_VISIBLE_MS,
  finishedVisibleSince,
  isRetired,
  settledAt,
  type RetirableOrder,
} from "./order-retirement";

const NOW = new Date("2026-09-21T12:00:00Z").getTime();
const ago = (minutes: number) => new Date(NOW - minutes * 60_000);

const order = (over: Partial<RetirableOrder> = {}): RetirableOrder => ({
  status: "DELIVERED",
  paymentStatus: "PAID",
  deliveredAt: ago(120),
  paidAt: ago(120),
  ...over,
});

describe("settledAt", () => {
  it("is null while the order is still in the kitchen", () => {
    for (const status of ["RECEIVED", "PREPARING", "READY"]) {
      expect(settledAt(order({ status }))).toBeNull();
    }
  });

  it("is null while the bill is unpaid", () => {
    expect(settledAt(order({ paymentStatus: "PENDING" }))).toBeNull();
  });

  /**
   * The later of the two, not the earlier. An online order paid before the food
   * arrives would otherwise start its hour at payment and leave the pass ten
   * minutes after being handed over.
   */
  it("takes the later timestamp when payment came first", () => {
    const row = order({ paidAt: ago(90), deliveredAt: ago(10) });
    expect(settledAt(row)).toBe(ago(10).getTime());
  });

  it("takes the later timestamp when delivery came first", () => {
    const row = order({ deliveredAt: ago(90), paidAt: ago(10) });
    expect(settledAt(row)).toBe(ago(10).getTime());
  });

  it("falls back to whichever timestamp exists", () => {
    expect(settledAt(order({ paidAt: null }))).toBe(ago(120).getTime());
    expect(settledAt(order({ deliveredAt: null }))).toBe(ago(120).getTime());
  });

  /** Rows that predate the column must not pin themselves to the board. */
  it("treats a paid order with no timestamps as long settled", () => {
    expect(settledAt(order({ deliveredAt: null, paidAt: null }))).toBe(0);
  });
});

describe("isRetired", () => {
  it("keeps an order that has just been finished", () => {
    expect(isRetired(order({ deliveredAt: ago(1), paidAt: ago(1) }), NOW)).toBe(false);
  });

  it("retires it once the window has passed", () => {
    expect(isRetired(order({ deliveredAt: ago(61), paidAt: ago(61) }), NOW)).toBe(true);
  });

  it("measures from the later event", () => {
    // Delivered three hours ago but only paid a minute ago: still live.
    const row = order({ deliveredAt: ago(180), paidAt: ago(1) });
    expect(isRetired(row, NOW)).toBe(false);
  });

  /**
   * The rule this feature exists to get right. An unpaid bill is the one case
   * where the board is the last thing between the venue and money walking out.
   */
  it("never retires an unpaid order, however old", () => {
    const row = order({ paymentStatus: "PENDING", deliveredAt: ago(60 * 24 * 30) });
    expect(isRetired(row, NOW)).toBe(false);
  });

  it("never retires an order still in the kitchen", () => {
    for (const status of ["RECEIVED", "PREPARING", "READY"]) {
      const row = order({ status, deliveredAt: ago(60 * 24), paidAt: ago(60 * 24) });
      expect(isRetired(row, NOW)).toBe(false);
    }
  });

  it("is exact at the boundary", () => {
    const settled = NOW - FINISHED_ORDER_VISIBLE_MS;
    const row = order({ deliveredAt: new Date(settled), paidAt: new Date(settled) });
    expect(isRetired(row, NOW)).toBe(true);
    expect(isRetired(row, NOW - 1)).toBe(false);
  });

  it("accepts serialised dates, as the browser receives them", () => {
    const row: RetirableOrder = {
      status: "DELIVERED",
      paymentStatus: "PAID",
      deliveredAt: ago(61).toISOString(),
      paidAt: ago(61).toISOString(),
    };
    expect(isRetired(row, NOW)).toBe(true);
  });
});

describe("finishedVisibleSince", () => {
  it("is one window behind the given instant", () => {
    expect(finishedVisibleSince(NOW).getTime()).toBe(NOW - FINISHED_ORDER_VISIBLE_MS);
  });

  /**
   * The query filter asks `deliveredAt >= cutoff OR paidAt >= cutoff`, which is
   * the same question as `max(delivered, paid) >= cutoff` — the form Prisma can
   * express. This pins that equivalence.
   */
  it("matches the OR form the query filter uses", () => {
    const cutoff = finishedVisibleSince(NOW).getTime();

    for (const [delivered, paid] of [
      [ago(10), ago(200)],
      [ago(200), ago(10)],
      [ago(200), ago(200)],
      [ago(10), ago(10)],
    ] as const) {
      const row = order({ deliveredAt: delivered, paidAt: paid });
      const byOr = delivered.getTime() >= cutoff || paid.getTime() >= cutoff;
      expect(byOr).toBe(!isRetired(row, NOW));
    }
  });
});
