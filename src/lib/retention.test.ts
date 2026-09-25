import { describe, expect, it } from "vitest";
import {
  MIN_CUSTOMERS_FOR_VALUE_TIER,
  MIN_ORDERS_FOR_INTERVAL,
  detectOpportunities,
  explainSegment,
  highValueThreshold,
  resolveValueTier,
  summariseRetention,
  typicalReturnInterval,
  type RetentionCandidate,
} from "./retention";
import {
  AT_RISK_DAYS,
  INACTIVE_DAYS,
  MAX_AT_RISK_DAYS,
  MIN_AT_RISK_DAYS,
  atRiskThreshold,
  resolveSegment,
} from "./customers";

const NOW = new Date("2026-09-08T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("typicalReturnInterval", () => {
  it("finds the rhythm of a regular", () => {
    // Every 14 days.
    const orders = [daysAgo(42), daysAgo(28), daysAgo(14), daysAgo(0)];
    expect(typicalReturnInterval(orders)).toBe(14);
  });

  it("does not care what order the dates arrive in", () => {
    const forwards = [daysAgo(42), daysAgo(28), daysAgo(14)];
    const backwards = [daysAgo(14), daysAgo(42), daysAgo(28)];

    expect(typicalReturnInterval(backwards)).toBe(typicalReturnInterval(forwards));
  });

  /**
   * The reason this is a median and not a mean. A weekly regular who took one
   * long holiday has fifty gaps of 7 and one of 60; the mean says they visit
   * monthly and would declare them healthy for another eight weeks.
   */
  it("is not dragged off by a single long absence", () => {
    const orders = [
      daysAgo(130),
      daysAgo(70), // a 60-day holiday
      daysAgo(63),
      daysAgo(56),
      daysAgo(49),
      daysAgo(42),
    ];

    expect(typicalReturnInterval(orders)).toBe(7);
  });

  it("averages the middle two on an even number of gaps", () => {
    // Gaps of 10 and 20 → median 15.
    expect(typicalReturnInterval([daysAgo(30), daysAgo(20), daysAgo(0)])).toBe(15);
  });

  // --- low-data protection -------------------------------------------------

  it("refuses to invent a rhythm from a single order", () => {
    expect(typicalReturnInterval([daysAgo(3)])).toBeNull();
  });

  /** Two orders is one gap, and one gap is an anecdote rather than a habit. */
  it("refuses to invent a rhythm from one gap", () => {
    expect(typicalReturnInterval([daysAgo(20), daysAgo(6)])).toBeNull();
  });

  it("starts answering at the documented minimum", () => {
    const orders = Array.from({ length: MIN_ORDERS_FOR_INTERVAL }, (_, i) =>
      daysAgo(i * 10),
    );
    expect(typicalReturnInterval(orders)).not.toBeNull();
  });

  it("never reports a zero-day rhythm", () => {
    // Three orders on one day would otherwise give a median gap of 0.
    expect(typicalReturnInterval([daysAgo(1), daysAgo(1), daysAgo(1)])).toBe(1);
  });
});

describe("atRiskThreshold", () => {
  it("falls back to the fixed threshold with no known rhythm", () => {
    expect(atRiskThreshold(null)).toBe(AT_RISK_DAYS);
  });

  it("scales to twice a known rhythm", () => {
    expect(atRiskThreshold(20)).toBe(40);
  });

  /** A daily regular has not churned after two days. */
  it("never drops below the floor for a very frequent guest", () => {
    expect(atRiskThreshold(1)).toBe(MIN_AT_RISK_DAYS);
    expect(atRiskThreshold(3)).toBe(MIN_AT_RISK_DAYS);
  });

  /**
   * A seasonal diner on a 45-day rhythm is twice overdue on day 90 — the exact
   * day they are written off anyway. The ceiling guarantees every guest a real
   * window in which they are visibly in trouble and still recoverable.
   */
  it("leaves a month to act before anyone goes inactive", () => {
    expect(atRiskThreshold(45)).toBe(MAX_AT_RISK_DAYS);
    expect(atRiskThreshold(1000)).toBe(MAX_AT_RISK_DAYS);
    expect(INACTIVE_DAYS - MAX_AT_RISK_DAYS).toBeGreaterThanOrEqual(30);
  });
});

describe("resolveSegment with a known rhythm", () => {
  /** The headline case: a weekly regular is in trouble well before 30 days. */
  it("flags a weekly regular who has been quiet a fortnight", () => {
    expect(
      resolveSegment(
        { orderCount: 9, lastOrderAt: daysAgo(16), typicalInterval: 7 },
        NOW,
      ),
    ).toBe("atRisk");
  });

  it("leaves that same guest alone after one missed week", () => {
    expect(
      resolveSegment({ orderCount: 9, lastOrderAt: daysAgo(9), typicalInterval: 7 }, NOW),
    ).toBe("loyal");
  });

  /** And the mirror: an occasional diner is not at risk on the fixed schedule. */
  it("does not flag a seasonal diner at thirty days", () => {
    expect(
      resolveSegment(
        { orderCount: 6, lastOrderAt: daysAgo(31), typicalInterval: 45 },
        NOW,
      ),
    ).toBe("loyal");
  });

  it("flags that seasonal diner once they are genuinely overdue", () => {
    expect(
      resolveSegment(
        { orderCount: 6, lastOrderAt: daysAgo(85), typicalInterval: 45 },
        NOW,
      ),
    ).toBe("atRisk");
  });

  /** Existing callers pass no interval and must behave exactly as before. */
  it("is unchanged when no rhythm is supplied", () => {
    expect(resolveSegment({ orderCount: 4, lastOrderAt: daysAgo(31) }, NOW)).toBe(
      "atRisk",
    );
    expect(resolveSegment({ orderCount: 4, lastOrderAt: daysAgo(29) }, NOW)).toBe(
      "returning",
    );
  });

  it("still never calls a one-time customer at risk", () => {
    expect(
      resolveSegment(
        { orderCount: 1, lastOrderAt: daysAgo(40), typicalInterval: 5 },
        NOW,
      ),
    ).toBe("new");
  });

  it("still lets long silence win over any rhythm", () => {
    expect(
      resolveSegment(
        { orderCount: 20, lastOrderAt: daysAgo(120), typicalInterval: 2 },
        NOW,
      ),
    ).toBe("inactive");
  });
});

describe("highValueThreshold", () => {
  const book = (n: number) => Array.from({ length: n }, (_, i) => (i + 1) * 100_000);

  it("returns the 80th percentile of a big enough book", () => {
    // 20 customers at 100k…2,000k → index floor(20*0.8) = 16 → 1,700,000.
    expect(highValueThreshold(book(20))).toBe(1_700_000);
  });

  // --- low-data protection -------------------------------------------------

  it("refuses to rank too small a book", () => {
    expect(highValueThreshold(book(MIN_CUSTOMERS_FOR_VALUE_TIER - 1))).toBeNull();
  });

  it("starts answering at the documented minimum", () => {
    expect(highValueThreshold(book(MIN_CUSTOMERS_FOR_VALUE_TIER))).not.toBeNull();
  });

  /**
   * Guests who left a number but never completed an order would otherwise drag
   * the threshold to nearly zero and make almost everyone "high value".
   */
  it("ignores customers who have never spent", () => {
    const withZeros = [...book(MIN_CUSTOMERS_FOR_VALUE_TIER), ...Array(50).fill(0)];
    expect(highValueThreshold(withZeros)).toBe(
      highValueThreshold(book(MIN_CUSTOMERS_FOR_VALUE_TIER)),
    );
  });
});

describe("resolveValueTier", () => {
  it("marks a big spender with repeat business high", () => {
    expect(resolveValueTier({ totalRevenue: 900_000, orderCount: 4 }, 500_000)).toBe(
      "high",
    );
  });

  it("includes someone exactly on the threshold", () => {
    expect(resolveValueTier({ totalRevenue: 500_000, orderCount: 4 }, 500_000)).toBe(
      "high",
    );
  });

  it("calls an ordinary spender standard", () => {
    expect(resolveValueTier({ totalRevenue: 100_000, orderCount: 4 }, 500_000)).toBe(
      "standard",
    );
  });

  // --- low-data protection -------------------------------------------------

  /** One enormous order is one large order, not a valuable relationship. */
  it("does not promote a single big order to high value", () => {
    expect(resolveValueTier({ totalRevenue: 9_000_000, orderCount: 1 }, 500_000)).toBe(
      "standard",
    );
  });

  it("answers unknown rather than guessing when the book is too small", () => {
    expect(resolveValueTier({ totalRevenue: 9_000_000, orderCount: 9 }, null)).toBe(
      "unknown",
    );
  });
});

describe("explainSegment", () => {
  it("distinguishes an overdue regular from one with no rhythm", () => {
    expect(
      explainSegment({
        segment: "atRisk",
        orderCount: 8,
        idleDays: 37,
        typicalInterval: 16,
      }).reason,
    ).toBe("atRiskOverdue");

    expect(
      explainSegment({
        segment: "atRisk",
        orderCount: 2,
        idleDays: 37,
        typicalInterval: null,
      }).reason,
    ).toBe("atRiskNoRhythm");
  });

  /** The numbers behind the label, so the dashboard can show its working. */
  it("carries the facts that produced the classification", () => {
    const explanation = explainSegment({
      segment: "atRisk",
      orderCount: 8,
      idleDays: 37,
      typicalInterval: 16,
    });

    expect(explanation).toMatchObject({
      idleDays: 37,
      typicalInterval: 16,
      overdueAfter: 32,
      orderCount: 8,
    });
  });

  it("tells a first-time customer apart from one who never ordered", () => {
    expect(
      explainSegment({
        segment: "new",
        orderCount: 1,
        idleDays: 3,
        typicalInterval: null,
      }).reason,
    ).toBe("newFirstOrder");

    expect(
      explainSegment({
        segment: "new",
        orderCount: 0,
        idleDays: null,
        typicalInterval: null,
      }).reason,
    ).toBe("newNoOrders");
  });

  it("explains every segment", () => {
    for (const segment of ["new", "returning", "loyal", "atRisk", "inactive"] as const) {
      expect(
        explainSegment({ segment, orderCount: 3, idleDays: 10, typicalInterval: 5 })
          .reason,
      ).toBeTruthy();
    }
  });
});

describe("detectOpportunities", () => {
  const customer = (over: Partial<RetentionCandidate>): RetentionCandidate => ({
    segment: "new",
    valueTier: "standard",
    orderCount: 1,
    totalRevenue: 100_000,
    idleDays: 5,
    ...over,
  });

  it("finds guests who bought once and have not come back", () => {
    const found = detectOpportunities([
      customer({}),
      customer({}),
      customer({ segment: "loyal", orderCount: 6 }),
    ]);

    expect(found.find((o) => o.key === "firstToSecond")?.count).toBe(2);
  });

  it("finds valuable guests who have gone quiet", () => {
    const found = detectOpportunities([
      customer({
        segment: "atRisk",
        valueTier: "high",
        orderCount: 8,
        totalRevenue: 2_000_000,
      }),
      customer({ segment: "atRisk", valueTier: "standard", orderCount: 3 }),
    ]);

    const opportunity = found.find((o) => o.key === "highValueAtRisk");
    expect(opportunity?.count).toBe(1);
    expect(opportunity?.revenueAtStake).toBe(2_000_000);
  });

  /**
   * A guest who tried the place once and drifted is a different problem from
   * one who had a habit and stopped, and needs a different answer.
   */
  it("keeps win-back to people who actually had a habit", () => {
    const found = detectOpportunities([
      customer({ segment: "inactive", orderCount: 1 }),
      customer({ segment: "inactive", orderCount: 5 }),
    ]);

    expect(found.find((o) => o.key === "winBack")?.count).toBe(1);
  });

  it("puts the most money at stake first", () => {
    const found = detectOpportunities([
      customer({ totalRevenue: 50_000 }),
      customer({
        segment: "atRisk",
        valueTier: "high",
        orderCount: 9,
        totalRevenue: 5_000_000,
      }),
    ]);

    expect(found[0]!.key).toBe("highValueAtRisk");
  });

  /** A card reading "0 customers" is one an owner reads and discards forever. */
  it("returns nothing at all for an empty book", () => {
    expect(detectOpportunities([])).toEqual([]);
  });

  it("omits groups with nobody in them rather than reporting zero", () => {
    const found = detectOpportunities([customer({ segment: "loyal", orderCount: 7 })]);

    expect(found.map((o) => o.key)).toEqual(["activeRegulars"]);
  });

  it("is deterministic", () => {
    const book = [
      customer({}),
      customer({ segment: "atRisk", valueTier: "high", orderCount: 4 }),
      customer({ segment: "inactive", orderCount: 3 }),
    ];

    expect(detectOpportunities(book)).toEqual(detectOpportunities(book));
  });
});

describe("summariseRetention", () => {
  it("reports the share of customers who came back", () => {
    const summary = summariseRetention([
      { orderCount: 1, totalRevenue: 100_000 },
      { orderCount: 3, totalRevenue: 300_000 },
      { orderCount: 5, totalRevenue: 600_000 },
      { orderCount: 1, totalRevenue: 100_000 },
    ]);

    expect(summary.withOrders).toBe(4);
    expect(summary.repeatCustomers).toBe(2);
    expect(summary.repeatRate).toBe(0.5);
  });

  /**
   * Customers who left a number but never completed an order are not failed
   * retention — they never entered the funnel, and counting them would make
   * every venue's repeat rate look worse than it is.
   */
  it("excludes people who have never ordered from the denominator", () => {
    const summary = summariseRetention([
      { orderCount: 0, totalRevenue: 0 },
      { orderCount: 2, totalRevenue: 200_000 },
    ]);

    expect(summary.withOrders).toBe(1);
    expect(summary.repeatRate).toBe(1);
  });

  it("averages lifetime value over customers who ordered", () => {
    const summary = summariseRetention([
      { orderCount: 1, totalRevenue: 100_000 },
      { orderCount: 3, totalRevenue: 300_000 },
    ]);

    expect(summary.averageLifetimeValue).toBe(200_000);
    expect(summary.averageOrders).toBe(2);
  });

  it("reports zeroes rather than dividing by zero", () => {
    expect(summariseRetention([])).toMatchObject({
      withOrders: 0,
      repeatRate: 0,
      averageLifetimeValue: 0,
    });
  });

  it("keeps lifetime value a whole number of Toman", () => {
    const summary = summariseRetention([
      { orderCount: 1, totalRevenue: 100_000 },
      { orderCount: 1, totalRevenue: 100_001 },
    ]);

    expect(Number.isInteger(summary.averageLifetimeValue)).toBe(true);
  });
});
