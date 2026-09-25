import { describe, expect, it } from "vitest";
import {
  TABLE_THRESHOLDS,
  assessTableConcentration,
  assessVisitRatio,
  buildTableReport,
  classifyActivity,
  tableKey,
  type ConfiguredTable,
  type TableOrderTotals,
  type TableReportInput,
} from "./tables";

/**
 * The same `ratioDelta` the platform uses, injected the way the real caller
 * injects it. Copied here rather than imported so a change to the shared helper
 * shows up as a failure in the module that owns it, not in this one.
 */
const delta = (current: number, previous: number): number | null => {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
};

const table = (number: string, over: Partial<ConfiguredTable> = {}): ConfiguredTable => ({
  id: `tbl_${number}`,
  number,
  label: null,
  seats: null,
  ...over,
});

const totals = (
  tableNumber: string,
  orders: number,
  revenue: number,
  over: Partial<TableOrderTotals> = {},
): TableOrderTotals => ({
  tableNumber,
  orders,
  revenue,
  lastOrderAt: null,
  ...over,
});

/** A venue busy enough and wide enough for the bands to be allowed to speak. */
const bandableInput = (over: Partial<TableReportInput> = {}): TableReportInput => ({
  configured: [table("1"), table("2"), table("3"), table("4")],
  current: [
    totals("1", 40, 40_000_000),
    totals("2", 10, 10_000_000),
    totals("3", 10, 10_000_000),
    totals("4", 20, 20_000_000),
  ],
  delta,
  ...over,
});

describe("tableKey", () => {
  it("prefers the configured table's id", () => {
    expect(tableKey({ id: "tbl_7", number: "7" })).toBe("tbl_7");
  });

  /** Two branches may both have a "1"; the id is what keeps them apart. */
  it("marks a number with no table row as unlisted", () => {
    expect(tableKey({ id: null, number: "7" })).toBe("unlisted:7");
  });
});

describe("classifyActivity", () => {
  it("calls a table busy at half again its fair share", () => {
    expect(classifyActivity(15, 10)).toBe("high");
  });

  it("calls a table quiet at half its fair share", () => {
    expect(classifyActivity(5, 10)).toBe("low");
  });

  it("calls an ordinary table medium", () => {
    expect(classifyActivity(11, 10)).toBe("medium");
  });

  it("reports no orders as none rather than as quiet", () => {
    expect(classifyActivity(0, 10)).toBe("none");
  });

  it("does not divide by a fair share of zero", () => {
    expect(classifyActivity(3, 0)).toBe("none");
  });
});

describe("assessVisitRatio", () => {
  it("withholds the ratio below the view floor", () => {
    const result = assessVisitRatio(TABLE_THRESHOLDS.minViewsForRatio - 1, 10);

    expect(result.status).toBe("insufficientData");
    expect(result.ratio).toBeNull();
  });

  it("reports the ratio once there are enough views", () => {
    const result = assessVisitRatio(100, 35);

    expect(result.status).toBe("measured");
    expect(result.ratio).toBeCloseTo(0.35);
  });

  /**
   * The Part 1 lesson, guarded.
   *
   * `merchandising.ts` divided order lines by guest sessions, called it a
   * conversion rate and clamped it to 100%. A table legitimately takes more
   * orders than its own code is opened — guests arriving from a plain link and
   * typing the number — and hiding that behind a cap would rebuild the bug.
   */
  it("does not clamp a ratio above one", () => {
    const result = assessVisitRatio(40, 60);

    expect(result.ratio).toBeCloseTo(1.5);
    expect(result.status).toBe("measured");
  });
});

describe("buildTableReport totals", () => {
  it("sums orders and revenue across tables", () => {
    const report = buildTableReport(bandableInput());

    expect(report.totals.orders).toBe(80);
    expect(report.totals.revenue).toBe(80_000_000);
    expect(report.totals.reportedTables).toBe(4);
    expect(report.totals.activeTables).toBe(4);
  });

  it("rounds the average order value the way analytics.ts does", () => {
    const report = buildTableReport(
      bandableInput({ current: [totals("1", 3, 1_000), totals("2", 10, 10_000)] }),
    );

    // 1000 / 3 = 333.33…
    expect(report.rows.find((row) => row.number === "1")?.averageOrderValue).toBe(333);
  });

  it("gives a table with no orders an average of zero, not NaN", () => {
    const report = buildTableReport(bandableInput({ current: [] }));

    for (const row of report.rows) {
      expect(row.averageOrderValue).toBe(0);
      expect(row.revenueShare).toBe(0);
    }
  });

  it("reports each table's share of the venue's table revenue", () => {
    const report = buildTableReport(bandableInput());

    expect(report.rows.find((row) => row.number === "1")?.revenueShare).toBeCloseTo(0.5);
  });
});

describe("buildTableReport table identity", () => {
  it("keeps configured tables that took no orders, at none", () => {
    const report = buildTableReport(
      bandableInput({
        current: [totals("1", 40, 40_000_000), totals("2", 40, 40_000_000)],
      }),
    );

    const quiet = report.rows.find((row) => row.number === "3");
    expect(quiet).toBeDefined();
    expect(quiet?.orders).toBe(0);
    expect(quiet?.activity).toBe("none");
    expect(quiet?.listed).toBe(true);
  });

  /**
   * Eight orders in the development database name a number no table row has.
   * The money is real, so the row is reported rather than dropped.
   */
  it("surfaces an order's table number that no configured table matches", () => {
    const report = buildTableReport(
      bandableInput({
        current: [...bandableInput().current, totals("99", 12, 12_000_000)],
      }),
    );

    const unlisted = report.rows.find((row) => row.number === "99");
    expect(unlisted?.listed).toBe(false);
    expect(unlisted?.id).toBeNull();
    expect(unlisted?.key).toBe("unlisted:99");
    expect(unlisted?.revenue).toBe(12_000_000);
  });

  it("lists configured tables first and in the venue's own order", () => {
    const report = buildTableReport(
      bandableInput({
        current: [totals("99", 12, 12_000_000), ...bandableInput().current],
      }),
    );

    expect(report.rows.map((row) => row.number)).toEqual(["1", "2", "3", "4", "99"]);
  });

  it("does not report the same number twice when it is both configured and ordered", () => {
    const report = buildTableReport(bandableInput());
    const numbers = report.rows.map((row) => row.number);

    expect(new Set(numbers).size).toBe(numbers.length);
  });
});

describe("buildTableReport low-data protection", () => {
  it("withholds bands when the venue has too few orders", () => {
    const report = buildTableReport(
      bandableInput({
        current: [
          totals("1", 3, 3_000_000),
          totals("2", 2, 2_000_000),
          totals("3", 2, 2_000_000),
          totals("4", 1, 1_000_000),
        ],
      }),
    );

    expect(report.totals.orders).toBeLessThan(TABLE_THRESHOLDS.minOrdersForBands);
    expect(report.activityStatus).toBe("insufficientData");
    for (const row of report.rows) expect(row.activity).toBeNull();
  });

  it("withholds bands when the venue has too few active tables", () => {
    const report = buildTableReport({
      configured: [table("1"), table("2")],
      current: [totals("1", 60, 60_000_000), totals("2", 20, 20_000_000)],
      delta,
    });

    expect(report.activityStatus).toBe("insufficientData");
    for (const row of report.rows) expect(row.activity).toBeNull();
  });

  it("still reports the counts it does have when bands are withheld", () => {
    const report = buildTableReport({
      configured: [table("1"), table("2")],
      current: [totals("1", 4, 4_000_000)],
      delta,
    });

    expect(report.rows.find((row) => row.number === "1")?.orders).toBe(4);
    expect(report.totals.revenue).toBe(4_000_000);
  });

  /**
   * "None" is a fact and survives the bands being withheld; "busy" and "quiet"
   * are relative and do not.
   */
  it("still reports a table with no orders as none in a too-quiet venue", () => {
    const report = buildTableReport({
      configured: [table("1"), table("2")],
      current: [totals("1", 4, 4_000_000)],
      delta,
    });

    expect(report.activityStatus).toBe("insufficientData");
    expect(report.rows.find((row) => row.number === "1")?.activity).toBeNull();
    expect(report.rows.find((row) => row.number === "2")?.activity).toBe("none");
  });

  /**
   * A dormant table must not make the room look busy.
   *
   * Fair share divides by *active* tables, so a venue that configured a terrace
   * it does not open in winter is judged on the room it is actually using.
   */
  it("excludes tables with no activity from the fair share", () => {
    const report = buildTableReport({
      configured: [table("1"), table("2"), table("3"), table("4"), table("5")],
      current: [
        totals("1", 10, 10_000_000),
        totals("2", 10, 10_000_000),
        totals("3", 10, 10_000_000),
        totals("4", 10, 10_000_000),
      ],
      delta,
    });

    expect(report.totals.activeTables).toBe(4);
    // Fair share is 40/4 = 10, so four even tables are medium, not high.
    for (const number of ["1", "2", "3", "4"]) {
      expect(report.rows.find((row) => row.number === number)?.activity).toBe("medium");
    }
    expect(report.rows.find((row) => row.number === "5")?.activity).toBe("none");
  });
});

describe("buildTableReport menu visits", () => {
  const withViews = (over: Partial<TableReportInput> = {}) =>
    buildTableReport(
      bandableInput({
        views: [
          { tableNumber: "1", views: 100 },
          { tableNumber: "2", views: 100 },
          { tableNumber: "", views: 10 },
        ],
        ...over,
      }),
    );

  it("separates attributed opens from those naming no table", () => {
    const report = withViews();

    expect(report.views.attributed).toBe(200);
    expect(report.views.unattributed).toBe(10);
    expect(report.views.coverage).toBeCloseTo(200 / 210);
    expect(report.views.status).toBe("measured");
  });

  it("reports a per-table ratio from that table's own opens", () => {
    const report = withViews();
    const first = report.rows.find((row) => row.number === "1");

    // 40 orders against this table's own 100 opens.
    expect(first?.visits.status).toBe("measured");
    expect(first?.visits.ratio).toBeCloseTo(0.4);
  });

  /**
   * §10's trap, guarded: the venue's orders must never be divided by one
   * table's views. Table 2 took ten orders, not the venue's eighty.
   */
  it("never divides the venue's orders by one table's views", () => {
    const report = withViews();
    const second = report.rows.find((row) => row.number === "2");

    expect(second?.visits.orders).toBe(10);
    expect(second?.visits.ratio).toBeCloseTo(0.1);
  });

  it("withholds every ratio when most traffic named no table", () => {
    const report = withViews({
      views: [
        { tableNumber: "1", views: 100 },
        { tableNumber: "", views: 900 },
      ],
    });

    expect(report.views.status).toBe("insufficientData");
    for (const row of report.rows) {
      expect(row.visits.status).toBe("insufficientData");
      expect(row.visits.ratio).toBeNull();
    }
  });

  it("reports no coverage at all before anything has been recorded", () => {
    const report = buildTableReport(bandableInput());

    expect(report.views.coverage).toBeNull();
    expect(report.views.status).toBe("insufficientData");
    for (const row of report.rows) expect(row.visits.ratio).toBeNull();
  });

  it("withholds a ratio for a table under the view floor even when coverage is good", () => {
    const report = withViews({
      views: [
        { tableNumber: "1", views: 100 },
        { tableNumber: "2", views: 5 },
      ],
    });

    expect(report.rows.find((row) => row.number === "1")?.visits.ratio).not.toBeNull();
    expect(report.rows.find((row) => row.number === "2")?.visits.ratio).toBeNull();
  });
});

describe("buildTableReport trend", () => {
  it("is absent when no previous window was supplied", () => {
    const report = buildTableReport(bandableInput());
    for (const row of report.rows) expect(row.trend).toBeNull();
  });

  it("reports the movement against the same table a period earlier", () => {
    const report = buildTableReport(
      bandableInput({
        previous: [totals("1", 20, 20_000_000), totals("2", 20, 20_000_000)],
      }),
    );

    const grew = report.rows.find((row) => row.number === "1");
    expect(grew?.trend?.ordersDelta).toBeCloseTo(1);
    expect(grew?.trend?.revenueDelta).toBeCloseTo(1);

    const shrank = report.rows.find((row) => row.number === "2");
    expect(shrank?.trend?.ordersDelta).toBeCloseTo(-0.5);
  });

  /** The two totals on a trend are the *earlier* window's, and say so. */
  it("carries the previous window's own totals, not this one's", () => {
    const report = buildTableReport(
      bandableInput({ previous: [totals("1", 20, 20_000_000)] }),
    );

    const row = report.rows.find((r) => r.number === "1");
    expect(row?.orders).toBe(40);
    expect(row?.trend?.previousOrders).toBe(20);
    expect(row?.trend?.previousRevenue).toBe(20_000_000);
  });

  /** Growth from nothing is new, not infinite. */
  it("reports a table with no history as having no baseline", () => {
    const report = buildTableReport(bandableInput({ previous: [] }));

    expect(report.rows.find((row) => row.number === "1")?.trend?.ordersDelta).toBeNull();
  });

  it("reports nothing-to-nothing as flat", () => {
    const report = buildTableReport(
      bandableInput({ current: [], previous: [], configured: [table("1")] }),
    );

    expect(report.rows[0]?.trend?.ordersDelta).toBe(0);
  });
});

describe("assessTableConcentration", () => {
  const rowsFor = (revenues: number[]) =>
    buildTableReport({
      configured: revenues.map((_, index) => table(String(index + 1))),
      current: revenues.map((revenue, index) => totals(String(index + 1), 10, revenue)),
      delta,
    }).rows;

  it("is silent when there are no more tables than the top slice", () => {
    expect(assessTableConcentration(rowsFor([100, 100, 100]))).toBeNull();
  });

  it("is silent when revenue is spread evenly", () => {
    expect(
      assessTableConcentration(rowsFor([10, 10, 10, 10, 10, 10, 10, 10])),
    ).toBeNull();
  });

  it("names the top tables when they carry most of the revenue", () => {
    const result = assessTableConcentration(rowsFor([100, 90, 80, 5, 5, 5, 5]));

    expect(result).not.toBeNull();
    expect(result?.topShare).toBeGreaterThanOrEqual(TABLE_THRESHOLDS.concentrationShare);
    expect(result?.tables).toEqual(["1", "2", "3"]);
  });

  /**
   * Tables that earned nothing are not tables the revenue is concentrated
   * *away* from — they are tables with no trade. Counting them would let a
   * venue where only three tables have ever been used report "concentration"
   * that is really just its size.
   */
  it("is silent when only the top slice has earned anything", () => {
    expect(assessTableConcentration(rowsFor([100, 90, 80, 0, 0, 0, 0]))).toBeNull();
  });

  it("measures the share against earning tables only", () => {
    const result = assessTableConcentration(rowsFor([100, 90, 80, 10, 10, 0, 0]));

    // 270 of 290, not of 290 spread across seven rows.
    expect(result?.topShare).toBeCloseTo(270 / 290);
    expect(result?.tables).toEqual(["1", "2", "3"]);
  });
});
