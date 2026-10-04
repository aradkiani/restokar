import { describe, expect, it } from "vitest";
import { dayKey, dayStart, shiftDay, summariseDay, type CloseOrder } from "./cash-close";

const order = (patch: Partial<CloseOrder>): CloseOrder => ({
  status: "DELIVERED",
  paymentMethod: "CASH_ON_SITE",
  paymentStatus: "PAID",
  total: 100,
  discount: 0,
  tip: 0,
  tax: 0,
  serviceCharge: 0,
  refundedAt: null,
  ...patch,
});

const tehran = (iso: string) => new Date(`${iso}+03:30`);

describe("cash close", () => {
  it("splits the day's money by how it was paid", () => {
    const summary = summariseDay([
      order({ total: 100, tip: 10, tax: 9 }),
      order({ total: 200, paymentMethod: "ONLINE" }),
      order({ total: 50, paymentStatus: "PENDING" }),
      order({ total: 70, discount: 5 }),
    ]);
    expect(summary).toMatchObject({
      orders: 4,
      sales: 420,
      cashPaid: 170,
      onlinePaid: 200,
      unpaidCount: 1,
      unpaidTotal: 50,
      discounts: 5,
      tips: 10,
      tax: 9,
      expectedCash: 170,
    });
  });

  it("keeps cash for a cancelled order in the till until it is refunded", () => {
    const summary = summariseDay([
      order({ total: 100 }),
      order({ total: 40, status: "CANCELED" }),
      order({ total: 60, status: "CANCELED", refundedAt: new Date() }),
      order({ total: 30, status: "CANCELED", paymentStatus: "PENDING" }),
    ]);
    expect(summary).toMatchObject({
      orders: 1,
      sales: 100,
      canceledCount: 3,
      canceledTotal: 130,
      refundsDueCount: 1,
      refundsDueTotal: 40,
      expectedCash: 140,
    });
  });

  it("an online order cancelled after payment owes a refund but adds no cash", () => {
    const summary = summariseDay([
      order({ total: 90, status: "CANCELED", paymentMethod: "ONLINE" }),
    ]);
    expect(summary.refundsDueTotal).toBe(90);
    expect(summary.expectedCash).toBe(0);
  });

  it("reads the day in Tehran time and never closes a future day", () => {
    const now = tehran("2026-10-04T01:30:00");
    expect(dayKey(now)).toBe("2026-10-04");
    expect(dayStart("2026-10-02", now)).toEqual(tehran("2026-10-02T00:00:00"));
    expect(dayStart("2027-01-01", now)).toEqual(tehran("2026-10-04T00:00:00"));
    expect(dayStart("rubbish", now)).toEqual(tehran("2026-10-04T00:00:00"));
    expect(shiftDay(tehran("2026-10-04T00:00:00"), -1)).toBe("2026-10-03");
    expect(shiftDay(tehran("2026-10-31T00:00:00"), 1)).toBe("2026-11-01");
  });
});
