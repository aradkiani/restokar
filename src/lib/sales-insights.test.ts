import { describe, expect, it } from "vitest";
import {
  INSIGHT_THRESHOLDS as T,
  buildSalesInsights,
  type EntityTotals,
  type SalesInsight,
  type SalesInsightInput,
} from "./sales-insights";

/**
 * A venue doing roughly 600 orders and 180M Toman over the window — the scale
 * the thresholds in `sales-insights.ts` were chosen against.
 */
const BASE_ORDERS = 600;
const BASE_REVENUE = 180_000_000;

function entity(name: string, revenue: number, quantity = 40): EntityTotals {
  return { key: name, id: name, name, revenue, quantity };
}

function input(over: Partial<SalesInsightInput> = {}): SalesInsightInput {
  return {
    current: { revenue: BASE_REVENUE, orders: BASE_ORDERS },
    previous: { revenue: BASE_REVENUE, orders: BASE_ORDERS },
    products: { current: [], previous: [] },
    categories: { current: [], previous: [] },
    ...over,
  };
}

const find = (list: SalesInsight[], type: string) => list.find((i) => i.type === type);
const types = (list: SalesInsight[]) => list.map((i) => i.type);

describe("low-data protection", () => {
  it("refuses to compare against a baseline that barely traded", () => {
    const report = buildSalesInsights(
      input({
        previous: { revenue: 200_000, orders: T.minOrdersPerPeriod - 1 },
        current: { revenue: 400_000, orders: 4 },
      }),
    );

    expect(report.status).toBe("insufficientData");
    expect(report.insights).toEqual([]);
  });

  it("refuses to compare against a period with no orders at all", () => {
    const report = buildSalesInsights(input({ previous: { revenue: 0, orders: 0 } }));

    expect(report.status).toBe("insufficientData");
    expect(report.insights).toEqual([]);
  });

  it("produces no decomposition when there is nothing to decompose", () => {
    const report = buildSalesInsights(input({ previous: { revenue: 0, orders: 0 } }));
    expect(report.decomposition).toBeNull();
  });

  /** A real collapse is still reportable — the baseline is what must be solid. */
  it("still reports a fall to almost nothing", () => {
    const report = buildSalesInsights(
      input({ current: { revenue: 2_000_000, orders: 8 } }),
    );

    expect(report.status).toBe("ok");
    expect(find(report.insights, "revenueChange")).toBeDefined();
  });
});

describe("revenue change", () => {
  it("reports a meaningful decrease", () => {
    const report = buildSalesInsights(
      input({ current: { revenue: 147_600_000, orders: 492 } }),
    );

    const insight = find(report.insights, "revenueChange")!;
    expect(insight.direction).toBe("down");
    expect(insight.deltaPercent).toBeCloseTo(-0.18, 2);
    expect(insight.deltaAbsolute).toBe(-32_400_000);
    expect(insight.severity).toBe("critical");
  });

  it("reports a meaningful increase as a positive signal", () => {
    const report = buildSalesInsights(
      input({ current: { revenue: 216_000_000, orders: 700 } }),
    );

    const insight = find(report.insights, "revenueChange")!;
    expect(insight.direction).toBe("up");
    expect(insight.severity).toBe("positive");
  });

  /** Tiny movements are noise; naming them trains an owner to ignore the page. */
  it("stays silent below the percentage threshold", () => {
    const nudge = Math.round(BASE_REVENUE * (1 + T.minPercentChange / 2));
    const report = buildSalesInsights(
      input({ current: { revenue: nudge, orders: 610 } }),
    );

    expect(types(report.insights)).not.toContain("revenueChange");
  });

  /**
   * A large percentage on a small base is also noise. Both gates must clear,
   * so a venue that took 300,000 Toman last week and 600,000 this week is not
   * told its revenue doubled.
   */
  it("stays silent below the absolute threshold even at a large percentage", () => {
    const report = buildSalesInsights(
      input({
        previous: { revenue: 600_000, orders: 40 },
        current: { revenue: 900_000, orders: 44 },
      }),
    );

    expect(types(report.insights)).not.toContain("revenueChange");
  });

  it("reports flat revenue as no change rather than as a decline", () => {
    const report = buildSalesInsights(input());
    expect(types(report.insights)).not.toContain("revenueChange");
  });
});

describe("order volume change", () => {
  it("reports a meaningful decrease", () => {
    const report = buildSalesInsights(
      input({ current: { revenue: 142_200_000, orders: 474 } }),
    );

    const insight = find(report.insights, "orderVolumeChange")!;
    expect(insight.direction).toBe("down");
    expect(insight.deltaPercent).toBeCloseTo(-0.21, 2);
  });

  it("reports a meaningful increase", () => {
    const report = buildSalesInsights(
      input({ current: { revenue: 225_000_000, orders: 750 } }),
    );

    expect(find(report.insights, "orderVolumeChange")!.direction).toBe("up");
  });

  it("stays silent when volume barely moves", () => {
    const report = buildSalesInsights(
      input({ current: { revenue: BASE_REVENUE, orders: BASE_ORDERS + 5 } }),
    );

    expect(types(report.insights)).not.toContain("orderVolumeChange");
  });
});

describe("average order value change", () => {
  it("uses the platform's rounded definition of average order value", () => {
    const report = buildSalesInsights(
      input({
        current: { revenue: 100_000, orders: 3 },
        previous: { revenue: 300_000, orders: 3 },
      }),
    );

    expect(report.totals.current.averageOrderValue).toBe(33_333);
  });

  it("reports a meaningful increase while volume holds", () => {
    const report = buildSalesInsights(
      input({ current: { revenue: 201_600_000, orders: 604 } }),
    );

    const insight = find(report.insights, "aovChange")!;
    expect(insight.direction).toBe("up");
    expect(insight.deltaPercent).toBeGreaterThan(T.minPercentChange);
  });

  it("reports a meaningful decrease", () => {
    const report = buildSalesInsights(
      input({ current: { revenue: 154_800_000, orders: 598 } }),
    );

    expect(find(report.insights, "aovChange")!.direction).toBe("down");
  });

  it("stays silent when the basket is stable", () => {
    const report = buildSalesInsights(
      input({ current: { revenue: 183_000_000, orders: 608 } }),
    );

    expect(types(report.insights)).not.toContain("aovChange");
  });

  it("treats a period with no orders as a zero basket rather than dividing by zero", () => {
    const report = buildSalesInsights(input({ current: { revenue: 0, orders: 0 } }));

    expect(report.totals.current.averageOrderValue).toBe(0);
    expect(Number.isFinite(report.totals.current.averageOrderValue)).toBe(true);
  });
});

describe("revenue decomposition", () => {
  it("names order volume as the driver when the basket held", () => {
    // 600 → 492 orders at a near-identical basket.
    const report = buildSalesInsights(
      input({ current: { revenue: 147_600_000, orders: 492 } }),
    );

    expect(report.decomposition!.driver).toBe("orders");
    expect(find(report.insights, "revenueDriver")!.values.driverShare).toBeGreaterThan(
      T.driverShare,
    );
  });

  it("names basket size as the driver when volume held", () => {
    // Orders barely move, revenue falls — the basket shrank.
    const report = buildSalesInsights(
      input({ current: { revenue: 154_800_000, orders: 598 } }),
    );

    expect(report.decomposition!.driver).toBe("averageOrderValue");
  });

  it("names both when neither dominates", () => {
    // Both down roughly 10%.
    const report = buildSalesInsights(
      input({ current: { revenue: 145_800_000, orders: 540 } }),
    );

    expect(report.decomposition!.driver).toBe("both");
  });

  it("names no driver when revenue did not meaningfully move", () => {
    const report = buildSalesInsights(input());
    expect(report.decomposition!.driver).toBe("none");
    expect(types(report.insights)).not.toContain("revenueDriver");
  });

  /**
   * The effects must add up to the revenue change, or the explanation is not an
   * explanation. Revenue is `orders × basket`, so the change splits into volume,
   * basket, and the corner where both moved.
   */
  it("splits the revenue change into effects that add back up", () => {
    const report = buildSalesInsights(
      input({ current: { revenue: 145_800_000, orders: 540 } }),
    );
    const d = report.decomposition!;

    expect(d.volumeEffect + d.valueEffect + d.interactionEffect).toBeCloseTo(
      d.revenueDelta,
      0,
    );
  });
});

describe("product contributors", () => {
  const products = (current: EntityTotals[], previous: EntityTotals[]) =>
    buildSalesInsights(
      input({
        current: { revenue: 147_600_000, orders: 492 },
        products: { current, previous },
      }),
    );

  it("names the biggest negative contributor", () => {
    const report = products(
      [entity("پیتزا", 10_000_000), entity("نوشابه", 9_000_000)],
      [entity("پیتزا", 25_000_000), entity("نوشابه", 10_000_000)],
    );

    const insight = find(report.insights, "topNegativeContributor")!;
    expect(insight.entity!.name).toBe("پیتزا");
    expect(insight.deltaAbsolute).toBe(-15_000_000);
  });

  it("names the biggest positive contributor", () => {
    const report = buildSalesInsights(
      input({
        current: { revenue: 216_000_000, orders: 700 },
        products: {
          current: [entity("برگر مرغ", 30_000_000)],
          previous: [entity("برگر مرغ", 10_000_000)],
        },
      }),
    );

    const insight = find(report.insights, "topPositiveContributor")!;
    expect(insight.entity!.name).toBe("برگر مرغ");
    expect(insight.deltaAbsolute).toBe(20_000_000);
  });

  /** A dish that sold twice is not evidence of anything. */
  it("ignores products below the sales floor", () => {
    const thin = { key: "x", id: "x", name: "کم‌فروش", revenue: 100_000, quantity: 2 };
    const report = products([thin], [{ ...thin, revenue: 400_000, quantity: 4 }]);

    expect(types(report.insights)).not.toContain("topNegativeContributor");
  });

  it("keeps a deleted product's history under its snapshot name", () => {
    const report = products(
      [],
      [
        {
          key: "deleted:قدیمی",
          id: null,
          name: "قدیمی",
          revenue: 20_000_000,
          quantity: 60,
        },
      ],
    );

    const insight = find(report.insights, "topNegativeContributor")!;
    expect(insight.entity!.id).toBeNull();
    expect(insight.entity!.name).toBe("قدیمی");
  });

  /**
   * Contributor shares are taken against the total *product-line* movement, not
   * against net revenue: line revenue excludes tax, tip, discounts and service
   * charge, so mixing the two bases would produce a share that cannot be
   * reconciled with anything on the page.
   */
  it("expresses the share against the product-line total, not net revenue", () => {
    const report = products(
      [entity("پیتزا", 10_000_000), entity("نوشابه", 5_000_000)],
      [entity("پیتزا", 25_000_000), entity("نوشابه", 10_000_000)],
    );

    // Pizza fell 15M of a 20M product-line decline.
    expect(find(report.insights, "topNegativeContributor")!.values.share).toBeCloseTo(
      0.75,
      2,
    );
  });
});

describe("category contributors", () => {
  it("reports a meaningful category decline", () => {
    const report = buildSalesInsights(
      input({
        current: { revenue: 147_600_000, orders: 492 },
        categories: {
          current: [entity("غذای اصلی", 40_000_000)],
          previous: [entity("غذای اصلی", 60_000_000)],
        },
      }),
    );

    const insight = find(report.insights, "categoryDecline")!;
    expect(insight.entity!.kind).toBe("category");
    expect(insight.deltaPercent).toBeCloseTo(-0.333, 2);
  });

  it("reports a meaningful category increase", () => {
    const report = buildSalesInsights(
      input({
        current: { revenue: 216_000_000, orders: 700 },
        categories: {
          current: [entity("نوشیدنی", 35_000_000)],
          previous: [entity("نوشیدنی", 25_000_000)],
        },
      }),
    );

    expect(find(report.insights, "categoryGrowth")!.direction).toBe("up");
  });

  it("ignores categories below the activity floor", () => {
    const report = buildSalesInsights(
      input({
        current: { revenue: 147_600_000, orders: 492 },
        categories: {
          current: [entity("جانبی", 100_000, 3)],
          previous: [entity("جانبی", 400_000, 6)],
        },
      }),
    );

    expect(types(report.insights)).not.toContain("categoryDecline");
  });
});

describe("customer behaviour", () => {
  const activity = (identified: number, returning: number) => ({
    identifiedOrders: identified,
    returningCustomerOrders: returning,
    newCustomerOrders: identified - returning,
  });

  it("reports a meaningful fall in returning-customer orders", () => {
    const report = buildSalesInsights(
      input({
        current: { revenue: 147_600_000, orders: 492 },
        customers: { current: activity(200, 85), previous: activity(220, 150) },
      }),
    );

    const insight = find(report.insights, "customerMixChange")!;
    expect(insight.direction).toBe("down");
    expect(insight.deltaAbsolute).toBe(-65);
  });

  it("stays silent when too few orders carry a customer", () => {
    const report = buildSalesInsights(
      input({
        current: { revenue: 147_600_000, orders: 492 },
        customers: { current: activity(4, 1), previous: activity(3, 2) },
      }),
    );

    expect(types(report.insights)).not.toContain("customerMixChange");
  });

  it("stays silent when no customer data is supplied at all", () => {
    const report = buildSalesInsights(
      input({ current: { revenue: 147_600_000, orders: 492 } }),
    );

    expect(types(report.insights)).not.toContain("customerMixChange");
  });

  it("stays silent when returning orders barely moved", () => {
    const report = buildSalesInsights(
      input({
        current: { revenue: 147_600_000, orders: 492 },
        customers: { current: activity(200, 148), previous: activity(200, 150) },
      }),
    );

    expect(types(report.insights)).not.toContain("customerMixChange");
  });
});

describe("merchandising integration", () => {
  it("flags a featured dish that was seen a lot and bought rarely", () => {
    const report = buildSalesInsights(
      input({
        featured: [
          {
            key: "p1",
            name: "پیتزا ویژه",
            impressions: 800,
            addedToCart: 6,
            purchases: 3,
          },
        ],
      }),
    );

    const insight = find(report.insights, "featuredWeakConversion")!;
    expect(insight.entity!.name).toBe("پیتزا ویژه");
    expect(insight.values.impressions).toBe(800);
    expect(insight.values.purchases).toBe(3);
  });

  it("says nothing about a dish with too few impressions to judge", () => {
    const report = buildSalesInsights(
      input({
        featured: [
          { key: "p1", name: "کم‌دیده", impressions: 5, addedToCart: 0, purchases: 0 },
        ],
      }),
    );

    expect(types(report.insights)).not.toContain("featuredWeakConversion");
  });

  it("says nothing when a dish is converting acceptably", () => {
    const report = buildSalesInsights(
      input({
        featured: [
          {
            key: "p1",
            name: "پرفروش",
            impressions: 500,
            addedToCart: 200,
            purchases: 150,
          },
        ],
      }),
    );

    expect(types(report.insights)).not.toContain("featuredWeakConversion");
  });

  it("handles missing merchandising analytics safely", () => {
    const report = buildSalesInsights(
      input({ featured: undefined, recommendations: undefined }),
    );

    expect(report.status).toBe("ok");
    expect(types(report.insights)).not.toContain("featuredWeakConversion");
    expect(types(report.insights)).not.toContain("recommendationWeakConversion");
  });

  it("flags a suggestion that is tapped but rarely bought", () => {
    const report = buildSalesInsights(
      input({
        recommendations: [
          {
            key: "r1",
            name: "سیب‌زمینی",
            impressions: 600,
            addedToCart: 120,
            purchases: 4,
          },
        ],
      }),
    );

    expect(find(report.insights, "recommendationWeakConversion")).toBeDefined();
  });
});

describe("prioritisation", () => {
  /** A large financial movement must outrank a small one. */
  it("ranks insights by financial impact", () => {
    const report = buildSalesInsights(
      input({
        current: { revenue: 147_600_000, orders: 492 },
        products: {
          current: [entity("پیتزا", 10_000_000)],
          previous: [entity("پیتزا", 25_000_000)],
        },
        featured: [
          { key: "p9", name: "حاشیه‌ای", impressions: 200, addedToCart: 1, purchases: 0 },
        ],
      }),
    );

    const scores = report.insights.map((i) => i.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(report.insights[0]!.type).toBe("revenueChange");
  });

  it("is deterministic for identical input", () => {
    const build = () =>
      buildSalesInsights(
        input({
          current: { revenue: 147_600_000, orders: 492 },
          products: {
            current: [entity("الف", 10_000_000), entity("ب", 10_000_000)],
            previous: [entity("الف", 25_000_000), entity("ب", 25_000_000)],
          },
        }),
      );

    expect(build()).toEqual(build());
  });

  it("gives every insight a stable, unique id", () => {
    const report = buildSalesInsights(
      input({
        current: { revenue: 147_600_000, orders: 492 },
        products: {
          current: [entity("پیتزا", 10_000_000)],
          previous: [entity("پیتزا", 25_000_000)],
        },
      }),
    );

    const ids = report.insights.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("honesty about causation", () => {
  /**
   * The engine emits message keys, never sentences, and the decomposition is
   * reported as an association. Nothing here may assert a reason.
   */
  it("never emits a message key that claims a cause", () => {
    const report = buildSalesInsights(
      input({
        current: { revenue: 147_600_000, orders: 492 },
        customers: {
          current: {
            identifiedOrders: 200,
            returningCustomerOrders: 85,
            newCustomerOrders: 115,
          },
          previous: {
            identifiedOrders: 220,
            returningCustomerOrders: 150,
            newCustomerOrders: 70,
          },
        },
      }),
    );

    for (const insight of report.insights) {
      expect(insight.messageKey, insight.type).not.toMatch(/because|causedBy|blame/i);
    }
  });

  it("marks thin-but-reportable findings as low confidence", () => {
    const report = buildSalesInsights(
      input({
        previous: { revenue: 6_000_000, orders: T.minOrdersPerPeriod },
        current: { revenue: 3_000_000, orders: 6 },
      }),
    );

    expect(find(report.insights, "revenueChange")!.confidence).toBe("low");
  });

  it("marks findings on a solid baseline as high confidence", () => {
    const report = buildSalesInsights(
      input({ current: { revenue: 147_600_000, orders: 492 } }),
    );

    expect(find(report.insights, "revenueChange")!.confidence).toBe("high");
  });

  /**
   * Confidence is a statement about the *baseline*, not about how small the
   * current period is. A venue that took 600 orders and then stopped has not
   * produced a thin finding — it has produced an alarming one, and calling it
   * "based on thin data" would tell the owner to discount the very thing they
   * most need to see.
   */
  it("treats a collapse from a solid baseline as high confidence", () => {
    const report = buildSalesInsights(input({ current: { revenue: 0, orders: 0 } }));

    expect(find(report.insights, "revenueChange")!.confidence).toBe("high");
  });
});
