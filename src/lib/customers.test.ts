import { describe, expect, it } from "vitest";
import {
  AT_RISK_DAYS,
  CUSTOMER_SEGMENTS,
  INACTIVE_DAYS,
  LOYAL_ORDER_THRESHOLD,
  averageOrderValue,
  canBeContacted,
  daysSince,
  deriveCustomer,
  isCustomerSegment,
  resolveSegment,
} from "./customers";

/**
 * A fixed "now" at mid-afternoon Tehran, so every offset below is a whole
 * number of calendar days rather than something that could straddle midnight.
 */
const NOW = new Date("2026-09-08T12:00:00Z");

/** `daysAgo(30)` — the same time of day, thirty calendar days earlier. */
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("daysSince", () => {
  it("counts whole calendar days", () => {
    expect(daysSince(NOW, NOW)).toBe(0);
    expect(daysSince(daysAgo(1), NOW)).toBe(1);
    expect(daysSince(daysAgo(45), NOW)).toBe(45);
  });

  /**
   * Calendar days, not elapsed hours: an order placed late last night is "1 day
   * ago" to an owner, which is what makes a 30-day threshold land on a date.
   */
  it("counts last night as one day ago, not a fraction", () => {
    // 20:15Z is 23:45 Tehran on 7 September; NOW is the afternoon of the 8th.
    expect(daysSince(new Date("2026-09-07T20:15:00Z"), NOW)).toBe(1);
  });

  it("treats earlier the same day as zero", () => {
    expect(daysSince(new Date("2026-09-08T04:00:00Z"), NOW)).toBe(0);
  });

  it("never goes negative for an instant in the future", () => {
    expect(daysSince(new Date("2026-09-20T12:00:00Z"), NOW)).toBe(0);
  });
});

describe("resolveSegment", () => {
  it("calls a customer with no counted orders new", () => {
    expect(resolveSegment({ orderCount: 0, lastOrderAt: null }, NOW)).toBe("new");
  });

  it("calls a single recent order new", () => {
    expect(resolveSegment({ orderCount: 1, lastOrderAt: daysAgo(2) }, NOW)).toBe("new");
  });

  it("calls a second order returning", () => {
    expect(resolveSegment({ orderCount: 2, lastOrderAt: daysAgo(2) }, NOW)).toBe(
      "returning",
    );
  });

  it("calls a regular loyal at the threshold", () => {
    expect(
      resolveSegment({ orderCount: LOYAL_ORDER_THRESHOLD, lastOrderAt: daysAgo(2) }, NOW),
    ).toBe("loyal");
  });

  it("keeps one order short of the threshold returning", () => {
    expect(
      resolveSegment(
        { orderCount: LOYAL_ORDER_THRESHOLD - 1, lastOrderAt: daysAgo(2) },
        NOW,
      ),
    ).toBe("returning");
  });

  it("flags a lapsed repeat customer as at risk", () => {
    expect(
      resolveSegment({ orderCount: 3, lastOrderAt: daysAgo(AT_RISK_DAYS) }, NOW),
    ).toBe("atRisk");
  });

  it("does not flag them a day early", () => {
    expect(
      resolveSegment({ orderCount: 3, lastOrderAt: daysAgo(AT_RISK_DAYS - 1) }, NOW),
    ).toBe("returning");
  });

  /**
   * A single visit five weeks ago is a guest who tried the place once, not a
   * relationship that lapsed — so they stay `new` until they are gone long
   * enough to be `inactive`.
   */
  it("does not call a one-time customer at risk", () => {
    expect(
      resolveSegment({ orderCount: 1, lastOrderAt: daysAgo(AT_RISK_DAYS + 5) }, NOW),
    ).toBe("new");
  });

  it("calls a long silence inactive", () => {
    expect(
      resolveSegment({ orderCount: 3, lastOrderAt: daysAgo(INACTIVE_DAYS) }, NOW),
    ).toBe("inactive");
  });

  it("calls a one-time customer inactive after the same silence", () => {
    expect(
      resolveSegment({ orderCount: 1, lastOrderAt: daysAgo(INACTIVE_DAYS) }, NOW),
    ).toBe("inactive");
  });

  /**
   * Recency outranks volume. Labelling a four-month-absent regular "loyal"
   * would tell an owner their retention is healthy when it is not.
   */
  it("calls an absent regular inactive rather than loyal", () => {
    expect(
      resolveSegment({ orderCount: 40, lastOrderAt: daysAgo(INACTIVE_DAYS + 30) }, NOW),
    ).toBe("inactive");
  });

  it("calls a regular who missed a month at risk rather than loyal", () => {
    expect(
      resolveSegment({ orderCount: 40, lastOrderAt: daysAgo(AT_RISK_DAYS + 1) }, NOW),
    ).toBe("atRisk");
  });

  it("always returns a known segment", () => {
    for (const orderCount of [0, 1, 2, 5, 50]) {
      for (const idle of [0, 1, 29, 30, 89, 90, 400]) {
        const segment = resolveSegment({ orderCount, lastOrderAt: daysAgo(idle) }, NOW);
        expect(CUSTOMER_SEGMENTS, `${orderCount} orders, ${idle} days`).toContain(
          segment,
        );
      }
    }
  });

  it("recognises exactly the catalogue", () => {
    for (const segment of CUSTOMER_SEGMENTS)
      expect(isCustomerSegment(segment)).toBe(true);
    expect(isCustomerSegment("vip")).toBe(false);
  });
});

describe("averageOrderValue", () => {
  it("divides revenue by orders", () => {
    expect(averageOrderValue(300_000, 3)).toBe(100_000);
  });

  it("floors rather than producing a fractional Toman", () => {
    expect(averageOrderValue(100_000, 3)).toBe(33_333);
  });

  it("is zero rather than dividing by zero", () => {
    expect(averageOrderValue(0, 0)).toBe(0);
  });
});

describe("deriveCustomer", () => {
  const base = {
    id: "c-1",
    phone: "09121234567",
    name: "آراد",
    marketingConsent: false,
    orderCount: 4,
    totalRevenue: 800_000,
    firstOrderAt: daysAgo(60),
    lastOrderAt: daysAgo(3),
  };

  it("assembles the derived view", () => {
    expect(deriveCustomer(base, NOW)).toEqual({
      id: "c-1",
      phone: "09121234567",
      name: "آراد",
      marketingConsent: false,
      orderCount: 4,
      totalRevenue: 800_000,
      averageOrderValue: 200_000,
      firstOrderAt: base.firstOrderAt,
      lastOrderAt: base.lastOrderAt,
      daysSinceLastOrder: 3,
      segment: "returning",
    });
  });

  it("handles a customer who has never ordered", () => {
    const derived = deriveCustomer(
      { ...base, orderCount: 0, totalRevenue: 0, firstOrderAt: null, lastOrderAt: null },
      NOW,
    );

    expect(derived.segment).toBe("new");
    expect(derived.averageOrderValue).toBe(0);
    expect(derived.daysSinceLastOrder).toBeNull();
  });
});

describe("canBeContacted", () => {
  /**
   * Both halves are required: a number is not permission, and permission
   * without a number is not reachability. Nothing sends anything yet — this
   * only exists so the consent is already recorded when something does.
   */
  it("requires a number and consent together", () => {
    expect(canBeContacted({ phone: "09121234567", marketingConsent: true })).toBe(true);
    expect(canBeContacted({ phone: "09121234567", marketingConsent: false })).toBe(false);
    expect(canBeContacted({ phone: null, marketingConsent: true })).toBe(false);
    expect(canBeContacted({ phone: null, marketingConsent: false })).toBe(false);
  });
});
