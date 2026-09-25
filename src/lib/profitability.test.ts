import { describe, expect, it } from "vitest";
import {
  PROFITABILITY_THRESHOLDS,
  assessCostCoverage,
  buildBenchmark,
  classifyProduct,
  menuConcentration,
  menuMargin,
  rankPerformance,
  realisedMargin,
  type ProductSales,
} from "./profitability";

/** A dish that comfortably clears every low-data floor unless a test says not. */
const sale = (over: Partial<ProductSales> & { key: string }): ProductSales => ({
  id: over.key,
  name: over.key,
  quantity: 50,
  revenue: 10_000_000,
  cost: 7_000_000,
  hasCost: true,
  ...over,
});

/** `n` interchangeable dishes, so a menu is big enough to be comparable. */
const filler = (n: number, each = 1_000_000) =>
  Array.from({ length: n }, (_, i) =>
    sale({ key: `filler-${i}`, revenue: each, cost: each * 0.7, quantity: 10 }),
  );

describe("realisedMargin", () => {
  it("computes gross margin from what actually sold", () => {
    expect(realisedMargin(1_000_000, 700_000, true)).toBeCloseTo(0.3);
  });

  /**
   * The single most important guard here. `(revenue - 0) / revenue` is 1.0, so
   * an uncosted dish would otherwise report a perfect margin — on exactly the
   * dishes the platform knows least about.
   */
  it("returns null rather than 100% for a dish with no cost recorded", () => {
    expect(realisedMargin(1_000_000, 0, false)).toBeNull();
  });

  it("returns null with no revenue", () => {
    expect(realisedMargin(0, 0, true)).toBeNull();
  });

  it("reports a negative margin rather than clamping it", () => {
    expect(realisedMargin(100_000, 150_000, true)).toBeCloseTo(-0.5);
  });
});

describe("menuMargin", () => {
  it("weights by what sold rather than averaging dish margins", () => {
    /*
      A best-seller at 20% and a garnish at 80%. The unweighted mean is 50%,
      which describes neither the menu nor the money; weighted is ~20.6%.
    */
    const products = [
      sale({ key: "seller", revenue: 10_000_000, cost: 8_000_000 }),
      sale({ key: "garnish", revenue: 200_000, cost: 40_000 }),
    ];

    const margin = menuMargin(products)!;
    expect(margin).toBeCloseTo((10_200_000 - 8_040_000) / 10_200_000);
    expect(margin).toBeLessThan(0.25);
  });

  it("ignores uncosted dishes so they cannot inflate the benchmark", () => {
    const costed = [sale({ key: "a", revenue: 1_000_000, cost: 700_000 })];
    const withUncosted = [
      ...costed,
      sale({ key: "b", revenue: 5_000_000, cost: 0, hasCost: false }),
    ];

    expect(menuMargin(withUncosted)).toBe(menuMargin(costed));
  });

  it("returns null when nothing costed has sold", () => {
    expect(menuMargin([sale({ key: "a", hasCost: false, cost: 0 })])).toBeNull();
  });
});

describe("assessCostCoverage", () => {
  it("measures coverage in money, not in dishes", () => {
    /*
      One uncosted best-seller against twelve costed garnishes. Counting dishes
      would call this 92% covered; the money says 50%, and the money is what the
      margin figure is built from.
    */
    const products = [
      sale({ key: "big", revenue: 6_000_000, cost: 0, hasCost: false }),
      ...filler(12, 500_000),
    ];

    const coverage = assessCostCoverage(products);
    expect(coverage.coverage).toBeCloseTo(0.5);
    expect(coverage.uncostedProducts).toBe(1);
  });

  it("calls a fully costed period reliable", () => {
    expect(assessCostCoverage(filler(5)).confidence).toBe("reliable");
  });

  it("calls a mostly uncosted period unknown", () => {
    const products = [
      sale({ key: "a", revenue: 9_000_000, cost: 0, hasCost: false }),
      sale({ key: "b", revenue: 1_000_000, cost: 700_000 }),
    ];

    expect(assessCostCoverage(products).confidence).toBe("unknown");
  });

  it("calls a half-costed period partial", () => {
    const products = [
      sale({ key: "a", revenue: 4_000_000, cost: 0, hasCost: false }),
      sale({ key: "b", revenue: 6_000_000, cost: 4_000_000 }),
    ];

    expect(assessCostCoverage(products).confidence).toBe("partial");
  });

  it("reports unknown rather than dividing by zero on an empty period", () => {
    expect(assessCostCoverage([])).toMatchObject({ confidence: "unknown", coverage: 0 });
  });
});

describe("typicalMargin as the comparison bar", () => {
  /**
   * The bug this exists to prevent, observed on real data: one best-seller at
   * 12% dragged a menu of otherwise 60–76% dishes to a 44.7% weighted mean, and
   * every remaining dish then cleared the "strong margin" bar. Six of eight rows
   * were badged a promotion opportunity, which is no opportunity at all.
   */
  it("is not dragged off by one catastrophic best-seller", () => {
    const menu = [
      sale({ key: "disaster", revenue: 130_000_000, cost: 114_000_000 }), // 12%
      ...Array.from(
        { length: 8 },
        (_, i) => sale({ key: `ok-${i}`, revenue: 10_000_000, cost: 3_500_000 }), // 65%
      ),
    ];

    const benchmark = buildBenchmark(menu);

    // The weighted mean collapses; the median does not.
    expect(benchmark.menuMargin!).toBeLessThan(0.5);
    expect(benchmark.typicalMargin!).toBeCloseTo(0.65);
  });

  it("leaves ordinary dishes unbadged when one outlier is present", () => {
    const menu = [
      sale({ key: "disaster", revenue: 130_000_000, cost: 114_000_000 }),
      ...Array.from({ length: 8 }, (_, i) =>
        sale({ key: `ok-${i}`, revenue: 10_000_000, cost: 3_500_000 }),
      ),
    ];

    const { rows } = rankPerformance(menu);

    // Exactly one dish is called out, and it is the right one.
    expect(rows.filter((r) => r.quadrant === "reviewPricing").map((r) => r.key)).toEqual([
      "disaster",
    ]);
    // The eight ordinary dishes are ordinary, not eight "opportunities".
    expect(rows.filter((r) => r.quadrant === "promote")).toHaveLength(0);
  });

  it("ignores dishes that never sold when deciding what is typical", () => {
    const withUnsold = [
      ...filler(8),
      sale({ key: "never-ordered", quantity: 0, revenue: 0, cost: 0 }),
    ];

    expect(buildBenchmark(withUnsold).typicalMargin).toBeCloseTo(
      buildBenchmark(filler(8)).typicalMargin!,
    );
  });
});

describe("classifyProduct", () => {
  /** Twelve dishes at a 30% margin, so the benchmark is a comfortable 30%. */
  const menu = filler(12, 1_000_000);
  const benchmark = buildBenchmark(menu);
  const total = 12_000_000;

  it("has a benchmark drawn from the venue's own menu", () => {
    expect(benchmark.menuMargin).toBeCloseTo(0.3);
    expect(benchmark.comparable).toBe(true);
  });

  /** The commercially important one: sells a lot, earns little. */
  it("flags a high-selling dish with a weak margin", () => {
    const burger = sale({
      key: "burger",
      revenue: 6_000_000,
      cost: 5_400_000, // 10% margin, a third of the menu's 30%
      quantity: 200,
    });

    expect(classifyProduct(burger, total + 6_000_000, benchmark).quadrant).toBe(
      "reviewPricing",
    );
  });

  it("flags a quiet dish with a strong margin as worth promoting", () => {
    const dessert = sale({
      key: "dessert",
      revenue: 400_000,
      cost: 100_000, // 75% margin
      quantity: 8,
    });

    expect(classifyProduct(dessert, total, benchmark).quadrant).toBe("promote");
  });

  it("calls a high-selling, high-margin dish a star", () => {
    const star = sale({
      key: "star",
      revenue: 6_000_000,
      cost: 2_000_000, // 67%
      quantity: 120,
    });

    expect(classifyProduct(star, total + 6_000_000, benchmark).quadrant).toBe("star");
  });

  // --- low-data protection -------------------------------------------------

  it("refuses to judge a dish that has barely sold", () => {
    const rare = sale({
      key: "rare",
      quantity: PROFITABILITY_THRESHOLDS.minQuantity - 1,
      revenue: 100_000,
      cost: 90_000,
    });

    expect(classifyProduct(rare, total, benchmark).quadrant).toBe("insufficient");
  });

  it("refuses to call an uncosted dish low-margin", () => {
    const uncosted = sale({ key: "uncosted", cost: 0, hasCost: false });
    const placed = classifyProduct(uncosted, total, benchmark);

    expect(placed.quadrant).toBe("unknown");
    expect(placed.margin).toBeNull();
  });

  it("refuses to rank a menu too small for high and low to mean anything", () => {
    const tiny = filler(PROFITABILITY_THRESHOLDS.minProductsForMatrix - 1);
    const tinyBenchmark = buildBenchmark(tiny);

    expect(tinyBenchmark.comparable).toBe(false);
    expect(classifyProduct(sale({ key: "x" }), total, tinyBenchmark).quadrant).toBe(
      "insufficient",
    );
  });

  it("carries the evidence behind the placement", () => {
    const placed = classifyProduct(
      sale({ key: "a", revenue: 6_000_000, cost: 3_000_000 }),
      12_000_000,
      benchmark,
    );

    expect(placed.margin).toBeCloseTo(0.5);
    expect(placed.grossProfit).toBe(3_000_000);
    expect(placed.revenueShare).toBeCloseTo(0.5);
    expect(placed.isHighVolume).toBe(true);
  });
});

describe("rankPerformance", () => {
  /**
   * Revenue would put the high-turnover, low-margin dish first. The question
   * this screen answers is what actually makes money.
   */
  it("ranks on realised gross profit, not revenue", () => {
    const rows = rankPerformance([
      sale({ key: "churner", revenue: 10_000_000, cost: 9_500_000 }), // 500k profit
      sale({ key: "earner", revenue: 4_000_000, cost: 1_000_000 }), // 3,000k profit
    ]).rows;

    expect(rows.map((r) => r.key)).toEqual(["earner", "churner"]);
  });

  it("sorts dishes with no cost last rather than dropping them", () => {
    const rows = rankPerformance([
      sale({ key: "uncosted", cost: 0, hasCost: false }),
      sale({ key: "costed", revenue: 1_000_000, cost: 500_000 }),
    ]).rows;

    expect(rows.map((r) => r.key)).toEqual(["costed", "uncosted"]);
    expect(rows.every((r) => r.key)).toBe(true);
  });

  it("is deterministic", () => {
    const products = [sale({ key: "a" }), sale({ key: "b" }), sale({ key: "c" })];
    expect(rankPerformance(products).rows).toEqual(rankPerformance(products).rows);
  });

  it("handles an empty period without dividing by zero", () => {
    const result = rankPerformance([]);
    expect(result.rows).toEqual([]);
    expect(result.totalRevenue).toBe(0);
  });
});

describe("menuConcentration", () => {
  it("names the share the top dishes carry", () => {
    const products = [
      sale({ key: "a", revenue: 5_000_000 }),
      sale({ key: "b", revenue: 3_000_000 }),
      sale({ key: "c", revenue: 2_000_000 }),
      ...filler(8, 125_000),
    ];

    const concentration = menuConcentration(products);
    expect(concentration.share).toBeCloseTo(10_000_000 / 11_000_000);
    expect(concentration.names).toEqual(["a", "b", "c"]);
    expect(concentration.isConcentrated).toBe(true);
  });

  /** Three dishes out of four are most of the revenue by arithmetic, not risk. */
  it("says nothing about a menu too small to be concentrated", () => {
    const products = [sale({ key: "a" }), sale({ key: "b" }), sale({ key: "c" })];
    expect(menuConcentration(products).isConcentrated).toBe(false);
  });

  it("does not flag an evenly spread menu", () => {
    expect(menuConcentration(filler(20, 1_000_000)).isConcentrated).toBe(false);
  });

  it("handles an empty period", () => {
    expect(menuConcentration([])).toMatchObject({ share: 0, isConcentrated: false });
  });
});
