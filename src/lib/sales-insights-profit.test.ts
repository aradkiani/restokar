import { describe, expect, it } from "vitest";
import {
  buildSalesInsights,
  type SalesInsight,
  type SalesInsightInput,
} from "./sales-insights";
import {
  assessCostCoverage,
  menuConcentration,
  rankPerformance,
  type ProductSales,
} from "./profitability";

/**
 * The profitability rules that were added to the existing sales-insight engine.
 *
 * Kept in their own file rather than appended to `sales-insights.test.ts`
 * because they exercise a different input — the `profitability` block — and the
 * existing suite's fixture deliberately does not supply one. Both files test
 * the same engine.
 *
 * Every case builds its input through the real `profitability.ts` helpers
 * rather than hand-writing a classified product, so a change to the placement
 * rules shows up here instead of being papered over by a fixture that encodes
 * the old answer.
 */

/** A baseline that comfortably clears the engine's own data floors. */
const BASE_REVENUE = 400_000_000;
const BASE_ORDERS = 1_200;

const sale = (over: Partial<ProductSales> & { key: string }): ProductSales => ({
  id: over.key,
  name: over.key,
  quantity: 50,
  revenue: 10_000_000,
  cost: 7_000_000,
  hasCost: true,
  ...over,
});

/** Twelve ordinary dishes at a 30% margin — the menu everything is judged against. */
const ordinaryMenu = () =>
  Array.from({ length: 12 }, (_, i) =>
    sale({ key: `dish-${i}`, revenue: 1_000_000, cost: 700_000, quantity: 20 }),
  );

function withProfitability(products: ProductSales[]): SalesInsightInput {
  const { rows, benchmark } = rankPerformance(products);

  return {
    current: { revenue: BASE_REVENUE, orders: BASE_ORDERS },
    previous: { revenue: BASE_REVENUE, orders: BASE_ORDERS },
    products: { current: [], previous: [] },
    categories: { current: [], previous: [] },
    profitability: {
      products: rows,
      benchmark,
      coverage: assessCostCoverage(products),
      concentration: menuConcentration(products),
    },
  };
}

const find = (list: SalesInsight[], type: string) => list.find((i) => i.type === type);

describe("high sales, low margin", () => {
  /** The headline case this whole layer exists for. */
  it("names a best-seller earning far below the menu", () => {
    const burger = sale({
      key: "burger",
      revenue: 6_000_000,
      cost: 5_400_000, // 10% against a 30% menu
      quantity: 300,
    });

    const report = buildSalesInsights(withProfitability([...ordinaryMenu(), burger]));
    const insight = find(report.insights, "highSalesLowMargin");

    expect(insight).toBeDefined();
    expect(insight!.entity?.name).toBe("burger");
    expect(insight!.severity).toBe("warning");
    expect(insight!.actionKey).toBe("reviewProductPricing");
  });

  /** Evidence, not a verdict: the owner can check every number in the sentence. */
  it("carries the figures behind the claim", () => {
    const burger = sale({
      key: "burger",
      revenue: 6_000_000,
      cost: 5_400_000,
      quantity: 300,
    });

    const insight = find(
      buildSalesInsights(withProfitability([...ordinaryMenu(), burger])).insights,
      "highSalesLowMargin",
    )!;

    expect(insight.values.margin).toBeCloseTo(0.1);
    /*
      30% — the median dish, not the 23.3% weighted mean.

      The sentence quotes the figure that actually produced the judgement. The
      weighted mean is dragged down by the very dish being judged (the burger is
      13 of the menu's 18 million), so quoting it could print a dish's margin as
      higher than the number it is being called weak against. The median is
      immune: one bad dish moves it by one position.
    */
    expect(insight.values.menuMargin).toBeCloseTo(0.3);
    expect(insight.values.revenue).toBe(6_000_000);
    expect(insight.values.quantity).toBe(300);
  });

  it("says nothing when every dish earns about the menu's margin", () => {
    const report = buildSalesInsights(withProfitability(ordinaryMenu()));
    expect(find(report.insights, "highSalesLowMargin")).toBeUndefined();
  });
});

describe("low sales, high margin", () => {
  it("names a quiet dish with strong economics", () => {
    const dessert = sale({
      key: "dessert",
      revenue: 400_000,
      cost: 100_000, // 75%
      quantity: 8,
    });

    const insight = find(
      buildSalesInsights(withProfitability([...ordinaryMenu(), dessert])).insights,
      "lowSalesHighMargin",
    );

    expect(insight).toBeDefined();
    expect(insight!.entity?.name).toBe("dessert");
    expect(insight!.severity).toBe("positive");
    // Points at the merchandising screen Part 1 already built.
    expect(insight!.actionKey).toBe("promoteProduct");
  });
});

describe("cost data quality gates the margin rules", () => {
  /**
   * The most important guard in this block. Naming a specific dish as
   * low-margin on the strength of half a venue's cost data would be exactly the
   * false precision this feature must not produce.
   */
  it("stays silent about margins when cost coverage is poor", () => {
    const menu = ordinaryMenu();
    const burger = sale({
      key: "burger",
      revenue: 6_000_000,
      cost: 5_400_000,
      quantity: 300,
    });
    // A large uncosted seller drags coverage below "reliable".
    const uncosted = sale({
      key: "uncosted",
      revenue: 20_000_000,
      cost: 0,
      hasCost: false,
      quantity: 200,
    });

    const report = buildSalesInsights(withProfitability([...menu, burger, uncosted]));

    expect(find(report.insights, "highSalesLowMargin")).toBeUndefined();
    expect(find(report.insights, "lowSalesHighMargin")).toBeUndefined();
  });

  /** …and says why the screen has gone quiet, which is the useful part. */
  it("explains the gap instead", () => {
    const uncosted = sale({
      key: "uncosted",
      revenue: 20_000_000,
      cost: 0,
      hasCost: false,
      quantity: 200,
    });

    const insight = find(
      buildSalesInsights(withProfitability([...ordinaryMenu(), uncosted])).insights,
      "costDataIncomplete",
    );

    expect(insight).toBeDefined();
    expect(insight!.values.products).toBe(1);
    expect(insight!.values.uncostedRevenue).toBe(20_000_000);
    expect(insight!.actionKey).toBe("addProductCosts");
  });

  it("does not nag when everything is costed", () => {
    const report = buildSalesInsights(withProfitability(ordinaryMenu()));
    expect(find(report.insights, "costDataIncomplete")).toBeUndefined();
  });
});

describe("menu concentration", () => {
  it("reports revenue resting on very few dishes", () => {
    const products = [
      sale({ key: "a", revenue: 40_000_000, cost: 28_000_000 }),
      sale({ key: "b", revenue: 30_000_000, cost: 21_000_000 }),
      sale({ key: "c", revenue: 20_000_000, cost: 14_000_000 }),
      ...Array.from({ length: 10 }, (_, i) =>
        sale({ key: `small-${i}`, revenue: 500_000, cost: 350_000, quantity: 10 }),
      ),
    ];

    const insight = find(
      buildSalesInsights(withProfitability(products)).insights,
      "menuConcentration",
    );

    expect(insight).toBeDefined();
    expect(insight!.values.share).toBeGreaterThan(0.4);
    // An observation about exposure — never a recommendation to change the menu.
    expect(insight!.actionKey).toBeUndefined();
    expect(insight!.severity).toBe("neutral");
  });

  it("says nothing about an evenly spread menu", () => {
    const report = buildSalesInsights(withProfitability(ordinaryMenu()));
    expect(find(report.insights, "menuConcentration")).toBeUndefined();
  });
});

describe("ranking across rule types", () => {
  /**
   * The reason the impact is expressed in Toman: a margin finding and a revenue
   * finding have to be comparable, or the page cannot order them honestly.
   */
  it("ranks a large margin shortfall above a small revenue move", () => {
    const burger = sale({
      key: "burger",
      revenue: 60_000_000,
      cost: 57_000_000, // 5% against 30% — a very large shortfall
      quantity: 2_000,
    });

    const base = withProfitability([...ordinaryMenu(), burger]);
    const report = buildSalesInsights({
      ...base,
      // A revenue move that clears the floors but is small in money terms.
      current: { revenue: BASE_REVENUE + 600_000, orders: BASE_ORDERS },
      previous: { revenue: BASE_REVENUE, orders: BASE_ORDERS },
    });

    const marginIndex = report.insights.findIndex((i) => i.type === "highSalesLowMargin");
    const revenueIndex = report.insights.findIndex((i) => i.type === "revenueChange");

    expect(marginIndex).toBeGreaterThanOrEqual(0);
    if (revenueIndex >= 0) expect(marginIndex).toBeLessThan(revenueIndex);
  });

  it("keeps the data-quality notice below real findings", () => {
    const products = [
      ...ordinaryMenu(),
      sale({ key: "uncosted", revenue: 20_000_000, cost: 0, hasCost: false }),
    ];

    const report = buildSalesInsights({
      ...withProfitability(products),
      current: { revenue: BASE_REVENUE * 1.4, orders: BASE_ORDERS + 300 },
      previous: { revenue: BASE_REVENUE, orders: BASE_ORDERS },
    });

    const costIndex = report.insights.findIndex((i) => i.type === "costDataIncomplete");
    const revenueIndex = report.insights.findIndex((i) => i.type === "revenueChange");

    expect(costIndex).toBeGreaterThan(revenueIndex);
  });
});

describe("backward compatibility", () => {
  /** Every caller predating this block supplies no profitability and must be unaffected. */
  it("produces no profitability insights without the input", () => {
    const report = buildSalesInsights({
      current: { revenue: BASE_REVENUE, orders: BASE_ORDERS },
      previous: { revenue: BASE_REVENUE * 0.5, orders: BASE_ORDERS / 2 },
      products: { current: [], previous: [] },
      categories: { current: [], previous: [] },
    });

    expect(report.status).toBe("ok");
    for (const type of [
      "highSalesLowMargin",
      "lowSalesHighMargin",
      "costDataIncomplete",
      "menuConcentration",
    ]) {
      expect(find(report.insights, type)).toBeUndefined();
    }
  });

  it("still refuses everything on an insufficient baseline", () => {
    const report = buildSalesInsights({
      ...withProfitability(ordinaryMenu()),
      previous: { revenue: 100_000, orders: 2 },
    });

    expect(report.status).toBe("insufficientData");
    expect(report.insights).toEqual([]);
  });
});
