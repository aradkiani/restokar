import { describe, expect, it } from "vitest";
import {
  applyCostDelta,
  passThroughDelta,
  priceHealth,
  recipeCost,
  roundCompareAt,
  roundMenuPrice,
  tidyExact,
  unitCost,
  type PricedIngredient,
} from "./costing";

const flourPerKg = (price: number, unit = "kg"): PricedIngredient => ({
  unit,
  purchasePrice: price,
  priceUnit: "kg",
});

describe("unitCost", () => {
  it("is the price when stocked in the unit it is bought in", () => {
    expect(unitCost(flourPerKg(45_000))).toBe(45_000);
  });

  it("converts to the stock unit: 45,000 a kilogram is 45 a gram", () => {
    expect(unitCost(flourPerKg(45_000, "g"))).toBeCloseTo(45, 10);
  });

  /** Kept unrounded — rounding here would skew every dish using saffron. */
  it("prices saffron bought per mesghal exactly, per gram", () => {
    const saffron = { unit: "g", purchasePrice: 1_500_000, priceUnit: "mesghal" };
    expect(unitCost(saffron)).toBeCloseTo(1_500_000 / 4.608, 6);
  });

  it("is null for an unpriced or inconsistent item", () => {
    expect(unitCost({ unit: "kg", purchasePrice: null, priceUnit: null })).toBeNull();
    expect(unitCost({ unit: "kg", purchasePrice: 0, priceUnit: "kg" })).toBeNull();
    expect(unitCost({ unit: "kg", purchasePrice: 1_000, priceUnit: "l" })).toBeNull();
  });
});

describe("recipeCost", () => {
  const items = new Map<string, PricedIngredient>([
    ["flour", flourPerKg(45_000)],
    ["cheese", { unit: "g", purchasePrice: 600_000, priceUnit: "kg" }],
    ["basil", { unit: "g", purchasePrice: null, priceUnit: null }],
  ]);

  /** The user's example: 230 g of flour at 45,000 a kilogram. */
  it("costs 230 g of flour at 45,000 a kilogram as 10,350", () => {
    const r = recipeCost([{ itemId: "flour", perUnitMilli: 230 }], items);
    expect(r.cost).toBe(10_350);
    expect(r.complete).toBe(true);
  });

  it("adds every line", () => {
    const r = recipeCost(
      [
        { itemId: "flour", perUnitMilli: 230 },
        { itemId: "cheese", perUnitMilli: 120_000 }, // 120 g
      ],
      items,
    );
    expect(r.cost).toBe(10_350 + 72_000);
  });

  it("marks a recipe with an unpriced ingredient incomplete, and names it", () => {
    const r = recipeCost(
      [
        { itemId: "flour", perUnitMilli: 230 },
        { itemId: "basil", perUnitMilli: 5_000 },
      ],
      items,
    );
    expect(r.complete).toBe(false);
    expect(r.unpricedItemIds).toEqual(["basil"]);
    expect(r.cost).toBe(10_350);
  });

  /** No recipe means no computed cost — not a cost of zero. */
  it("treats an empty recipe as having no computed cost", () => {
    expect(recipeCost([], items).complete).toBe(false);
  });
});

describe("pass-through — the dish moves by exactly its own cost change", () => {
  /**
   * The user's example. Flour up 10%: the 230 g in the dish cost 10% more —
   * 1,035 Toman — and the dish's price rises by the same 1,035.
   */
  it("raises a dish using 230 g of flour by 1,035 when flour rises 10%", () => {
    const delta = passThroughDelta(230, flourPerKg(45_000), flourPerKg(49_500));
    expect(delta).toBe(1_035);
    expect(applyCostDelta(250_000, delta)).toBe(251_035);
  });

  it("applies the same percentage to the 230 g as to the kilogram", () => {
    const before = recipeCost(
      [{ itemId: "f", perUnitMilli: 230 }],
      new Map([["f", flourPerKg(45_000)]]),
    );
    const after = recipeCost(
      [{ itemId: "f", perUnitMilli: 230 }],
      new Map([["f", flourPerKg(49_500)]]),
    );
    expect(after.cost / before.cost).toBeCloseTo(49_500 / 45_000, 10);
  });

  it("lowers the dish when the ingredient gets cheaper", () => {
    const delta = passThroughDelta(230, flourPerKg(49_500), flourPerKg(45_000));
    expect(delta).toBe(-1_035);
    expect(applyCostDelta(251_035, delta)).toBe(250_000);
  });

  /** Correcting a typo must take the menu back to where it was. */
  it("reverses exactly when a mistaken price is corrected", () => {
    const up = passThroughDelta(230, flourPerKg(45_000), flourPerKg(450_000));
    const down = passThroughDelta(230, flourPerKg(450_000), flourPerKg(45_000));
    expect(applyCostDelta(applyCostDelta(250_000, up), down)).toBe(250_000);
  });

  /**
   * The first price entered establishes the cost; it is not an increase, and
   * adding the whole ingredient cost to a price that already covered it would
   * double-count it.
   */
  it("moves nothing when an ingredient is priced for the first time", () => {
    const unpriced = { unit: "kg", purchasePrice: null, priceUnit: null };
    expect(passThroughDelta(230, unpriced, flourPerKg(45_000))).toBe(0);
  });

  it("moves nothing when only the quoting unit changes", () => {
    const perKg = flourPerKg(45_000);
    const perGram = { unit: "kg", purchasePrice: 45, priceUnit: "g" };
    expect(passThroughDelta(230, perKg, perGram)).toBe(0);
  });

  it("keeps a free dish free and never goes below zero", () => {
    expect(applyCostDelta(0, 5_000)).toBe(0);
    expect(applyCostDelta(1_000, -5_000)).toBe(0);
  });
});

describe("roundMenuPrice — rounding only for display", () => {
  it("rounds to the nearest step", () => {
    expect(roundMenuPrice(251_035, 1_000)).toBe(251_000);
    expect(roundMenuPrice(251_035, 5_000)).toBe(250_000);
    expect(roundMenuPrice(252_600, 5_000)).toBe(255_000);
  });

  it("shows whole Toman when the step is 0", () => {
    expect(roundMenuPrice(251_035.4, 0)).toBe(251_035);
  });

  it("keeps free free and priced priced", () => {
    expect(roundMenuPrice(0, 10_000)).toBe(0);
    expect(roundMenuPrice(300, 10_000)).toBe(300);
    expect(roundMenuPrice(0.3, 0)).toBe(1);
  });

  /** Many small increases must show up once they add up — nothing is lost. */
  it("lets small exact increases accumulate into a visible change", () => {
    let exact = 250_000;
    const shown: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      exact = applyCostDelta(exact, 1_035);
      shown.push(roundMenuPrice(exact, 5_000));
    }
    expect(shown).toEqual([250_000, 250_000, 255_000, 255_000]);
    expect(exact).toBe(254_140);
  });

  it("ignores floating-point noise", () => {
    expect(roundMenuPrice(0.1 + 0.2, 0)).toBe(1);
    expect(tidyExact(0.1 + 0.2)).toBe(0.3);
  });
});

describe("roundCompareAt", () => {
  it("rounds a 'was' price like any other", () => {
    expect(roundCompareAt(302_500, 250_000, 250_000, 10_000)).toBe(300_000);
  });

  it("never lets rounding erase a discount", () => {
    // 98,000 and 100,000 both round to 100,000 at a 10,000 step.
    expect(roundCompareAt(100_000, 98_000, 100_000, 10_000)).toBeGreaterThan(100_000);
  });

  it("is null when there is no 'was' price", () => {
    expect(roundCompareAt(null, 100, 100, 1_000)).toBeNull();
    expect(roundCompareAt(0, 100, 100, 1_000)).toBeNull();
  });
});

describe("priceHealth — warnings when a price is set too low", () => {
  it("warns when the ingredients cost more than the dish sells for", () => {
    const h = priceHealth({ price: 90_000, cost: 100_000, lowMarginPercent: 30 });
    expect(h.warning).toBe("BELOW_COST");
    expect(h.marginPercent).toBeLessThan(0);
  });

  it("warns when the margin is under the venue's floor", () => {
    const h = priceHealth({ price: 120_000, cost: 100_000, lowMarginPercent: 30 });
    expect(h.warning).toBe("LOW_MARGIN");
    expect(h.marginPercent).toBeCloseTo(16.7, 1);
  });

  it("treats a price equal to its cost as a zero margin, not a loss", () => {
    const h = priceHealth({ price: 100_000, cost: 100_000, lowMarginPercent: 30 });
    expect(h.warning).toBe("LOW_MARGIN");
    expect(h.marginPercent).toBe(0);
  });

  it("stays quiet for a healthy price", () => {
    const h = priceHealth({ price: 250_000, cost: 80_000, lowMarginPercent: 30 });
    expect(h.warning).toBeNull();
    expect(h.marginPercent).toBe(68);
  });

  /** Warning about a dish with no known cost teaches owners to ignore warnings. */
  it("says nothing when the cost is unknown", () => {
    expect(
      priceHealth({ price: 250_000, cost: 0, lowMarginPercent: 30 }).warning,
    ).toBeNull();
  });

  it("respects a floor of zero, which turns the margin warning off", () => {
    const h = priceHealth({ price: 101_000, cost: 100_000, lowMarginPercent: 0 });
    expect(h.warning).toBeNull();
  });
});
