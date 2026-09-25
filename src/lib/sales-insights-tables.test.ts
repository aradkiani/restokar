import { describe, expect, it } from "vitest";
import { buildTableInsights, ratioDelta, type SalesInsight } from "./sales-insights";
import {
  assessTableConcentration,
  buildTableReport,
  type ConfiguredTable,
  type TableOrderTotals,
  type TableReportInput,
  type TableViewTotals,
} from "./tables";

/**
 * The table rules, tested through the report they read.
 *
 * Inputs are built with `buildTableReport` rather than hand-written rows, so a
 * rule can never be tested against a shape the real pipeline cannot produce —
 * which is how a gate like "the bands are withheld" gets accidentally bypassed
 * in a test and then fires in production.
 */

const table = (number: string): ConfiguredTable => ({
  id: `tbl_${number}`,
  number,
  label: null,
  seats: null,
});

const totals = (
  tableNumber: string,
  orders: number,
  revenue: number,
): TableOrderTotals => ({ tableNumber, orders, revenue, lastOrderAt: null });

function reportOf(over: Partial<TableReportInput> = {}) {
  return buildTableReport({
    configured: [table("1"), table("2"), table("3"), table("4")],
    current: [
      totals("1", 40, 40_000_000),
      totals("2", 15, 15_000_000),
      totals("3", 15, 15_000_000),
      totals("4", 15, 15_000_000),
    ],
    delta: ratioDelta,
    ...over,
  });
}

const insightsFor = (over: Partial<TableReportInput> = {}): SalesInsight[] => {
  const report = reportOf(over);
  return buildTableInsights({
    report,
    concentration: assessTableConcentration(report.rows),
  });
};

const typeOf = (insights: SalesInsight[], type: string) =>
  insights.find((insight) => insight.type === type);

describe("tableHighActivity", () => {
  it("names the table carrying much more than an even share", () => {
    const insight = typeOf(insightsFor(), "tableHighActivity");

    expect(insight).toBeDefined();
    expect(insight?.entity).toEqual({ kind: "table", id: "tbl_1", name: "1" });
    expect(insight?.severity).toBe("positive");
    expect(insight?.values.orders).toBe(40);
  });

  it("compares against what an evenly busy table would take", () => {
    const insight = typeOf(insightsFor(), "tableHighActivity");

    // 85,000,000 across four active tables.
    expect(insight?.comparison).toBe(21_250_000);
  });

  /** No bands, no "busiest": the gate lives in the report, not in the rule. */
  it("is silent when the venue is too quiet for bands", () => {
    const insights = insightsFor({
      current: [totals("1", 4, 4_000_000), totals("2", 2, 2_000_000)],
    });

    expect(typeOf(insights, "tableHighActivity")).toBeUndefined();
  });

  it("is silent when the busiest table has barely earned anything", () => {
    const insights = insightsFor({
      current: [
        totals("1", 40, 400_000),
        totals("2", 15, 100_000),
        totals("3", 15, 100_000),
        totals("4", 15, 100_000),
      ],
    });

    expect(typeOf(insights, "tableHighActivity")).toBeUndefined();
  });
});

describe("tableActivityDecline", () => {
  const previous = [
    totals("1", 40, 40_000_000),
    totals("2", 40, 40_000_000),
    totals("3", 15, 15_000_000),
    totals("4", 15, 15_000_000),
  ];

  it("names the table that fell furthest in money", () => {
    const insight = typeOf(insightsFor({ previous }), "tableActivityDecline");

    expect(insight).toBeDefined();
    expect(insight?.entity?.name).toBe("2");
    expect(insight?.severity).toBe("warning");
    expect(insight?.direction).toBe("down");
    expect(insight?.deltaAbsolute).toBe(-25_000_000);
  });

  it("reports the earlier window's totals, not this one's", () => {
    const insight = typeOf(insightsFor({ previous }), "tableActivityDecline");

    expect(insight?.metric).toBe(15_000_000);
    expect(insight?.comparison).toBe(40_000_000);
    expect(insight?.values.previousOrders).toBe(40);
    expect(insight?.values.orders).toBe(15);
  });

  it("is silent when the fall is below the platform's money floor", () => {
    const insights = insightsFor({
      current: [
        totals("1", 40, 40_000_000),
        totals("2", 15, 15_000_000),
        totals("3", 15, 15_000_000),
        totals("4", 15, 14_900_000),
      ],
      previous: [
        totals("1", 40, 40_000_000),
        totals("2", 15, 15_000_000),
        totals("3", 15, 15_000_000),
        totals("4", 15, 15_000_000),
      ],
    });

    expect(typeOf(insights, "tableActivityDecline")).toBeUndefined();
  });

  /**
   * A table used twice last month and once this month has not declined.
   * Without the baseline gate this is a 50% fall and the loudest thing on the
   * page.
   */
  it("is silent when the earlier window had no real trade at that table", () => {
    const insights = insightsFor({
      previous: [totals("1", 40, 40_000_000), totals("2", 2, 30_000_000)],
    });

    expect(typeOf(insights, "tableActivityDecline")).toBeUndefined();
  });

  it("is silent when nothing declined", () => {
    const insights = insightsFor({
      previous: [
        totals("1", 10, 10_000_000),
        totals("2", 5, 5_000_000),
        totals("3", 5, 5_000_000),
        totals("4", 5, 5_000_000),
      ],
    });

    expect(typeOf(insights, "tableActivityDecline")).toBeUndefined();
  });
});

describe("tableViewsWithoutOrders", () => {
  /** Four tables clearing the view floor, one of them taking few orders. */
  const views: TableViewTotals[] = [
    { tableNumber: "1", views: 100 },
    { tableNumber: "2", views: 100 },
    { tableNumber: "3", views: 100 },
    { tableNumber: "4", views: 100 },
  ];

  it("names a table whose opens far outrun its orders", () => {
    const insights = insightsFor({
      current: [
        totals("1", 40, 40_000_000),
        totals("2", 40, 40_000_000),
        totals("3", 40, 40_000_000),
        totals("4", 2, 2_000_000),
      ],
      views,
    });

    const insight = typeOf(insights, "tableViewsWithoutOrders");
    expect(insight?.entity?.name).toBe("4");
    expect(insight?.values.views).toBe(100);
    expect(insight?.values.orders).toBe(2);
  });

  /**
   * §13, guarded. This is the rule most able to become a causal claim, so it
   * carries the mildest badge the engine has.
   */
  it("states the observation without badging it a fault", () => {
    const insights = insightsFor({
      current: [
        totals("1", 40, 40_000_000),
        totals("2", 40, 40_000_000),
        totals("3", 40, 40_000_000),
        totals("4", 2, 2_000_000),
      ],
      views,
    });

    expect(typeOf(insights, "tableViewsWithoutOrders")?.severity).toBe("neutral");
  });

  it("is silent before any menu opens have been recorded", () => {
    const insights = insightsFor({
      current: [
        totals("1", 40, 40_000_000),
        totals("2", 40, 40_000_000),
        totals("3", 40, 40_000_000),
        totals("4", 2, 2_000_000),
      ],
    });

    expect(typeOf(insights, "tableViewsWithoutOrders")).toBeUndefined();
  });

  /**
   * The denominator gate: a venue whose menu is mostly opened from a plain link
   * cannot have its tables judged on opens.
   */
  it("is silent when most of the venue's traffic named no table", () => {
    const insights = insightsFor({
      current: [
        totals("1", 40, 40_000_000),
        totals("2", 40, 40_000_000),
        totals("3", 40, 40_000_000),
        totals("4", 2, 2_000_000),
      ],
      views: [...views, { tableNumber: "", views: 5_000 }],
    });

    expect(typeOf(insights, "tableViewsWithoutOrders")).toBeUndefined();
  });

  it("is silent when too few tables have enough opens to compare", () => {
    const insights = insightsFor({
      current: [
        totals("1", 40, 40_000_000),
        totals("2", 40, 40_000_000),
        totals("3", 40, 40_000_000),
        totals("4", 2, 2_000_000),
      ],
      views: [
        { tableNumber: "1", views: 100 },
        { tableNumber: "4", views: 100 },
      ],
    });

    expect(typeOf(insights, "tableViewsWithoutOrders")).toBeUndefined();
  });

  it("is silent when every table converts at about the same rate", () => {
    const insights = insightsFor({ views });

    expect(typeOf(insights, "tableViewsWithoutOrders")).toBeUndefined();
  });
});

describe("tableConcentration", () => {
  it("reports exposure without calling it a problem", () => {
    const insights = insightsFor({
      configured: [table("1"), table("2"), table("3"), table("4"), table("5")],
      current: [
        totals("1", 40, 40_000_000),
        totals("2", 40, 40_000_000),
        totals("3", 40, 40_000_000),
        totals("4", 10, 2_000_000),
        totals("5", 10, 2_000_000),
      ],
    });

    const insight = typeOf(insights, "tableConcentration");
    expect(insight?.severity).toBe("neutral");
    expect(insight?.values.count).toBe(3);
    expect(insight?.values.share).toBeGreaterThan(0.5);
  });
});

describe("table insights overall", () => {
  it("ranks a decline above a compliment", () => {
    const insights = insightsFor({
      previous: [
        totals("1", 40, 40_000_000),
        totals("2", 40, 40_000_000),
        totals("3", 15, 15_000_000),
        totals("4", 15, 15_000_000),
      ],
    });

    expect(insights[0]?.type).toBe("tableActivityDecline");
  });

  it("gives every finding a stable id and a table it is about", () => {
    const insights = insightsFor({
      previous: [
        totals("1", 40, 40_000_000),
        totals("2", 40, 40_000_000),
        totals("3", 15, 15_000_000),
        totals("4", 15, 15_000_000),
      ],
    });

    expect(insights.length).toBeGreaterThan(0);
    for (const insight of insights) {
      expect(insight.id).toBeTruthy();
      if (insight.entity) expect(insight.entity.kind).toBe("table");
    }

    const ids = insights.map((insight) => insight.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("says nothing at all about a venue with no trade", () => {
    expect(insightsFor({ current: [] })).toEqual([]);
  });

  /** An unlisted number can still be named; it just has no id to point at. */
  it("can name a table number that has no configured row", () => {
    const insights = insightsFor({
      configured: [table("1"), table("2"), table("3")],
      current: [
        totals("99", 60, 60_000_000),
        totals("1", 10, 10_000_000),
        totals("2", 10, 10_000_000),
        totals("3", 10, 10_000_000),
      ],
    });

    const insight = typeOf(insights, "tableHighActivity");
    expect(insight?.entity).toEqual({ kind: "table", id: null, name: "99" });
  });
});
