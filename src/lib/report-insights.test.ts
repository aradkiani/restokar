import { describe, expect, it } from "vitest";
import { deriveReportInsights, type InsightInput } from "./report-insights";
import type { DayPoint } from "./analytics";

/**
 * These judgements drive the written advice an owner acts on, so the bands and
 * the trend deadband are pinned here rather than left to drift.
 */

function series(orderCounts: number[]): DayPoint[] {
  return orderCounts.map((orders, index) => ({
    date: `2026-03-${String(index + 1).padStart(2, "0")}`,
    revenue: orders * 100_000,
    cost: orders * 40_000,
    orders,
  }));
}

function input(overrides: Partial<InsightInput> = {}): InsightInput {
  return {
    orders: 1000,
    averageOrderValue: 300_000,
    revenue: 300_000_000,
    netProfit: 30_000_000,
    margin: 0.1,
    expenses: 60_000_000,
    days: 30,
    daily: series([10, 10, 10, 10, 10, 10]),
    ...overrides,
  };
}

describe("demand trend", () => {
  it("reads a rising second half as growing", () => {
    expect(
      deriveReportInsights(input({ daily: series([5, 5, 5, 12, 12, 12]) })).demand,
    ).toBe("growing");
  });

  it("reads a falling second half as falling", () => {
    expect(
      deriveReportInsights(input({ daily: series([12, 12, 12, 5, 5, 5]) })).demand,
    ).toBe("falling");
  });

  it("treats a small swing as steady rather than a trend", () => {
    // ~5% up, inside the deadband — not something to tell an owner about.
    expect(deriveReportInsights(input({ daily: series([20, 20, 21, 21]) })).demand).toBe(
      "steady",
    );
  });

  it("does not call a trend on too few days", () => {
    expect(deriveReportInsights(input({ daily: series([1, 40]) })).demand).toBe("steady");
  });

  it("survives a period that opened with no orders", () => {
    expect(
      deriveReportInsights(input({ daily: series([0, 0, 0, 4, 5, 6]) })).demand,
    ).toBe("growing");
  });
});

describe("profit bands", () => {
  it("flags a loss regardless of margin", () => {
    const result = deriveReportInsights(input({ netProfit: -1, margin: -0.2 }));
    expect(result.profit).toBe("loss");
    expect(result.recommendations).toContain("profitLoss");
  });

  it("separates thin, healthy and strong", () => {
    expect(deriveReportInsights(input({ margin: 0.04 })).profit).toBe("thin");
    expect(deriveReportInsights(input({ margin: 0.1 })).profit).toBe("healthy");
    expect(deriveReportInsights(input({ margin: 0.2 })).profit).toBe("strong");
  });
});

describe("pricing position", () => {
  it("sees headroom when demand holds up but the margin does not", () => {
    const result = deriveReportInsights(
      input({ margin: 0.03, daily: series([10, 10, 10, 10, 10, 10]) }),
    );
    expect(result.pricing).toBe("headroom");
    expect(result.recommendations).toContain("pricingHeadroom");
  });

  it("points at costs instead when demand is already falling", () => {
    const result = deriveReportInsights(
      input({ margin: 0.03, daily: series([20, 20, 20, 6, 6, 6]) }),
    );
    expect(result.pricing).toBe("reviewCosts");
    expect(result.recommendations).toContain("pricingReviewCosts");
  });

  it("leaves a healthy venue's pricing alone", () => {
    expect(deriveReportInsights(input({ margin: 0.18 })).pricing).toBe("hold");
  });
});

describe("metrics", () => {
  it("derives the ratios the report prints", () => {
    const { metrics } = deriveReportInsights(
      input({
        orders: 1000,
        days: 50,
        revenue: 300_000_000,
        cost: 100_000_000,
        grossProfit: 200_000_000,
        expenses: 60_000_000,
        netProfit: 30_000_000,
      }),
    );

    expect(metrics.ordersPerDay).toBe(20);
    expect(metrics.profitPerOrder).toBe(30_000);
    expect(metrics.grossMargin).toBeCloseTo(200 / 300, 5);
    expect(metrics.netMargin).toBeCloseTo(30 / 300, 5);
    expect(metrics.foodCostRatio).toBeCloseTo(100 / 300, 5);
    expect(metrics.expenseRatio).toBeCloseTo(60 / 300, 5);
  });

  it("computes break-even from the gross margin, not the net one", () => {
    // 60m of running costs carried by a 2/3 gross margin needs 90m of sales.
    const { metrics } = deriveReportInsights(
      input({
        revenue: 300_000_000,
        cost: 100_000_000,
        grossProfit: 200_000_000,
        expenses: 60_000_000,
        averageOrderValue: 300_000,
      }),
    );
    expect(metrics.breakEvenRevenue).toBe(90_000_000);
    expect(metrics.breakEvenOrders).toBe(300);
  });

  it("reports zero break-even rather than infinity when nothing is earned", () => {
    const { metrics } = deriveReportInsights(
      input({ revenue: 0, cost: 0, grossProfit: 0, expenses: 5_000_000, orders: 0 }),
    );
    expect(metrics.breakEvenRevenue).toBe(0);
    expect(metrics.breakEvenOrders).toBe(0);
    expect(Number.isFinite(metrics.profitPerOrder)).toBe(true);
  });

  it("reports the demand swing the trend judgement used", () => {
    const { metrics } = deriveReportInsights(input({ daily: series([10, 10, 20, 20]) }));
    expect(metrics.demandChange).toBeCloseTo(1, 5);
  });

  it("falls back to revenue minus cost when gross profit is not supplied", () => {
    const { metrics } = deriveReportInsights(
      input({ revenue: 200_000_000, cost: 50_000_000, grossProfit: undefined }),
    );
    expect(metrics.grossMargin).toBeCloseTo(150 / 200, 5);
  });
});

describe("recommendations", () => {
  it("always produces a demand, pricing and profit sentence", () => {
    const { recommendations } = deriveReportInsights(input());
    expect(recommendations).toHaveLength(3);
    expect(recommendations.some((key) => key.startsWith("demand"))).toBe(true);
    expect(recommendations.some((key) => key.startsWith("pricing"))).toBe(true);
    expect(recommendations.some((key) => key.startsWith("profit"))).toBe(true);
  });

  it("adds an overheads sentence only when expenses are heavy", () => {
    expect(
      deriveReportInsights(input({ expenses: 150_000_000 })).recommendations,
    ).toContain("expenseHeavy");
    expect(
      deriveReportInsights(input({ expenses: 10_000_000 })).recommendations,
    ).not.toContain("expenseHeavy");
  });

  it("stays within a few sentences", () => {
    const worst = deriveReportInsights(
      input({
        margin: -0.3,
        netProfit: -5,
        expenses: 200_000_000,
        daily: series([30, 30, 30, 2, 2, 2]),
      }),
    );
    expect(worst.recommendations.length).toBeLessThanOrEqual(4);
  });

  it("never repeats a sentence", () => {
    const { recommendations } = deriveReportInsights(input({ expenses: 150_000_000 }));
    expect(new Set(recommendations).size).toBe(recommendations.length);
  });

  it("handles a zero-revenue period without dividing by zero", () => {
    const result = deriveReportInsights(
      input({
        revenue: 0,
        orders: 0,
        netProfit: 0,
        margin: 0,
        daily: series([0, 0, 0, 0]),
      }),
    );
    expect(result.recommendations).not.toContain("expenseHeavy");
    expect(Number.isFinite(result.recommendations.length)).toBe(true);
  });
});
