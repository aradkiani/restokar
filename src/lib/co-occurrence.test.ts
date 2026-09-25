import { describe, expect, it } from "vitest";
import {
  CO_OCCURRENCE_THRESHOLDS,
  baseRate,
  confidenceOf,
  hasEnoughHistory,
  liftOf,
  partnersFor,
  qualifies,
  rankCoOccurrence,
  type ProductPairCounts,
} from "./co-occurrence";

const BURGER = "p-burger";
const FRIES = "p-fries";
const COLA = "p-drink";
const SALAD = "p-salad";
const CAKE = "p-cake";

/**
 * A pair that comfortably clears every bar, so each test can break exactly one
 * thing and be sure that is what it measured.
 *
 * 100 bills with the burger, 40 of them also with chips, chips on 120 of 1,000
 * bills overall: confidence 0.40, base rate 0.12, lift 3.33.
 */
const strong = (over: Partial<ProductPairCounts> = {}): ProductPairCounts => ({
  sourceProductId: BURGER,
  targetProductId: FRIES,
  pairCount: 40,
  sourceSupport: 100,
  targetSupport: 120,
  totalOrders: 1000,
  ...over,
});

describe("the arithmetic", () => {
  it("confidence is the share of the source's bills carrying the target", () => {
    expect(confidenceOf(strong())).toBeCloseTo(0.4);
  });

  it("base rate is how often the target appears on any bill", () => {
    expect(baseRate(strong())).toBeCloseTo(0.12);
  });

  it("lift is confidence against that base rate", () => {
    expect(liftOf(strong())).toBeCloseTo(0.4 / 0.12);
  });

  it("reports zero rather than dividing by zero", () => {
    expect(confidenceOf(strong({ sourceSupport: 0 }))).toBe(0);
    expect(baseRate(strong({ totalOrders: 0 }))).toBe(0);
  });

  /**
   * Infinity would sort a dish that has never sold to the top of every list on
   * the strength of having no evidence at all.
   */
  it("gives a never-sold target zero lift, not Infinity", () => {
    const lift = liftOf(strong({ targetSupport: 0 }));

    expect(Number.isFinite(lift)).toBe(true);
    expect(lift).toBe(0);
  });
});

describe("hasEnoughHistory", () => {
  it("refuses a venue below the order floor", () => {
    expect(hasEnoughHistory(CO_OCCURRENCE_THRESHOLDS.minTotalOrders - 1)).toBe(false);
  });

  it("accepts a venue at the floor", () => {
    expect(hasEnoughHistory(CO_OCCURRENCE_THRESHOLDS.minTotalOrders)).toBe(true);
  });
});

describe("qualifies", () => {
  it("accepts a pair that clears every bar", () => {
    expect(qualifies(strong())).toBe(true);
  });

  it("rejects a dish paired with itself", () => {
    expect(qualifies(strong({ targetProductId: BURGER }))).toBe(false);
  });

  /** The low-data fallback: a new venue gets the owner's pairings, not this. */
  it("rejects everything while the venue is too new", () => {
    expect(
      qualifies(
        strong({
          totalOrders: CO_OCCURRENCE_THRESHOLDS.minTotalOrders - 1,
          targetSupport: 5,
        }),
      ),
    ).toBe(false);
  });

  it("rejects a thin denominator even when the ratio looks strong", () => {
    // Two bills out of four is 50% confidence and means nothing.
    expect(qualifies(strong({ pairCount: 2, sourceSupport: 4, targetSupport: 10 }))).toBe(
      false,
    );
  });

  it("rejects a handful of coincidences", () => {
    expect(
      qualifies(strong({ pairCount: CO_OCCURRENCE_THRESHOLDS.minPairCount - 1 })),
    ).toBe(false);
  });

  it("rejects weak attachment", () => {
    // 10 of 100 bills — under the 15% confidence floor.
    expect(qualifies(strong({ pairCount: 10 }))).toBe(false);
  });

  /**
   * The rule the whole module exists for. A drink on 60% of every bill reaches
   * 60% confidence against *any* dish, because it is associated with dinner
   * rather than with the burger.
   */
  it("rejects a universally popular dish that is not actually associated", () => {
    const ubiquitous = strong({
      targetProductId: COLA,
      pairCount: 60,
      sourceSupport: 100,
      targetSupport: 600,
      totalOrders: 1000,
    });

    expect(confidenceOf(ubiquitous)).toBeCloseTo(0.6);
    expect(liftOf(ubiquitous)).toBeCloseTo(1);
    expect(qualifies(ubiquitous)).toBe(false);
  });

  it("accepts a less frequent dish that is genuinely associated", () => {
    const associated = strong({
      targetProductId: SALAD,
      pairCount: 30,
      sourceSupport: 100,
      targetSupport: 90,
      totalOrders: 1000,
    });

    // Lower confidence than the cola above, but a far higher lift.
    expect(confidenceOf(associated)).toBeLessThan(0.6);
    expect(qualifies(associated)).toBe(true);
  });

  it("rejects a pair ordered together less often than chance", () => {
    expect(
      qualifies(strong({ pairCount: 15, targetSupport: 400, totalOrders: 1000 })),
    ).toBe(false);
  });
});

describe("rankCoOccurrence", () => {
  it("drops everything that does not qualify", () => {
    expect(rankCoOccurrence([strong({ pairCount: 1 })])).toEqual([]);
  });

  /** Count ranks by popularity; lift ranks by association. */
  it("ranks on association, not on raw pair count", () => {
    const popular = strong({
      targetProductId: COLA,
      pairCount: 50,
      targetSupport: 500,
    });
    const associated = strong({
      targetProductId: SALAD,
      pairCount: 25,
      targetSupport: 60,
    });

    const ranked = rankCoOccurrence([popular, associated]);

    expect(popular.pairCount).toBeGreaterThan(associated.pairCount);
    expect(ranked[0]!.targetProductId).toBe(SALAD);
  });

  it("exposes the arithmetic that got each pair there", () => {
    const [row] = rankCoOccurrence([strong()]);

    expect(row!.confidence).toBeCloseTo(0.4);
    expect(row!.lift).toBeCloseTo(0.4 / 0.12);
    expect(row!.pairCount).toBe(40);
  });

  it("is deterministic — identical arithmetic never swaps places", () => {
    const twins = [strong({ targetProductId: CAKE }), strong({ targetProductId: SALAD })];

    const once = rankCoOccurrence(twins).map((r) => r.targetProductId);
    const twice = rankCoOccurrence([...twins].reverse()).map((r) => r.targetProductId);

    expect(once).toEqual(twice);
  });

  it("does not mutate its input", () => {
    const rows = [strong({ targetProductId: CAKE }), strong({ targetProductId: SALAD })];
    rankCoOccurrence(rows);

    expect(rows.map((r) => r.targetProductId)).toEqual([CAKE, SALAD]);
  });
});

describe("partnersFor", () => {
  const graph = [
    strong({ sourceProductId: BURGER, targetProductId: FRIES, targetSupport: 120 }),
    strong({ sourceProductId: BURGER, targetProductId: SALAD, targetSupport: 60 }),
    strong({ sourceProductId: COLA, targetProductId: CAKE, targetSupport: 50 }),
  ];

  it("returns only the named dish's partners", () => {
    expect(partnersFor(BURGER, graph, 5).map((r) => r.targetProductId)).toEqual([
      SALAD,
      FRIES,
    ]);
  });

  it("caps the list", () => {
    expect(partnersFor(BURGER, graph, 1)).toHaveLength(1);
  });

  it("returns nothing for a dish with no qualifying partner", () => {
    expect(partnersFor(CAKE, graph, 5)).toEqual([]);
  });

  /**
   * Filtering before ranking, not after: ranked globally, the cola pair could
   * consume the limit and leave the burger with nothing.
   */
  it("is not starved by another dish's stronger pair", () => {
    const dominant = strong({
      sourceProductId: COLA,
      targetProductId: CAKE,
      pairCount: 90,
      targetSupport: 20,
    });

    expect(partnersFor(BURGER, [dominant, ...graph], 1)).toHaveLength(1);
  });

  it("treats a non-positive limit as nothing to show", () => {
    expect(partnersFor(BURGER, graph, 0)).toEqual([]);
    expect(partnersFor(BURGER, graph, -3)).toEqual([]);
  });
});
