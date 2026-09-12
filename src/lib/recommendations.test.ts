import { describe, expect, it } from "vitest";
import {
  MAX_PUBLIC_RECOMMENDATIONS,
  derivePerformance,
  rankByRevenue,
  selectRecommendations,
  type RecommendationEdge,
} from "./recommendations";

const BURGER = "p-burger";
const PIZZA = "p-pizza";
const FRIES = "p-fries";
const DRINK = "p-drink";
const SALAD = "p-salad";
const DESSERT = "p-dessert";

const edge = (source: string, target: string): RecommendationEdge => ({
  sourceProductId: source,
  recommendedProductId: target,
});

/** Everything orderable unless a test says otherwise. */
const allOrderable = new Set([BURGER, PIZZA, FRIES, DRINK, SALAD, DESSERT]);

describe("selectRecommendations", () => {
  it("suggests what the owner attached to a dish in the basket", () => {
    expect(selectRecommendations([edge(BURGER, FRIES)], [BURGER], allOrderable)).toEqual([
      { sourceProductId: BURGER, recommendedProductId: FRIES },
    ]);
  });

  it("suggests nothing when the basket is empty", () => {
    expect(selectRecommendations([edge(BURGER, FRIES)], [], allOrderable)).toEqual([]);
  });

  it("ignores suggestions for dishes that are not in the basket", () => {
    expect(selectRecommendations([edge(PIZZA, DRINK)], [BURGER], allOrderable)).toEqual(
      [],
    );
  });

  it("keeps the owner's order", () => {
    const picks = selectRecommendations(
      [edge(BURGER, DRINK), edge(BURGER, FRIES), edge(BURGER, SALAD)],
      [BURGER],
      allOrderable,
    );

    expect(picks.map((p) => p.recommendedProductId)).toEqual([DRINK, FRIES, SALAD]);
  });

  /** Offering chips to someone who already has chips reads as automated. */
  it("never suggests something already in the basket", () => {
    expect(
      selectRecommendations(
        [edge(BURGER, FRIES), edge(BURGER, DRINK)],
        [BURGER, FRIES],
        allOrderable,
      ).map((p) => p.recommendedProductId),
    ).toEqual([DRINK]);
  });

  /**
   * The Part 2 integration. `orderable` is the effective availability the menu
   * already resolved, so an out-of-hours or sold-out dish is simply absent.
   */
  it("never suggests a dish that cannot be ordered right now", () => {
    const orderable = new Set([BURGER, DRINK]);

    expect(
      selectRecommendations(
        [edge(BURGER, FRIES), edge(BURGER, DRINK)],
        [BURGER],
        orderable,
      ).map((p) => p.recommendedProductId),
    ).toEqual([DRINK]);
  });

  it("suggests nothing when every candidate is unavailable", () => {
    expect(
      selectRecommendations([edge(BURGER, FRIES)], [BURGER], new Set([BURGER])),
    ).toEqual([]);
  });

  it("caps the list", () => {
    const picks = selectRecommendations(
      [
        edge(BURGER, FRIES),
        edge(BURGER, DRINK),
        edge(BURGER, SALAD),
        edge(BURGER, DESSERT),
      ],
      [BURGER],
      allOrderable,
    );

    expect(picks).toHaveLength(MAX_PUBLIC_RECOMMENDATIONS);
    expect(picks.map((p) => p.recommendedProductId)).toEqual([FRIES, DRINK, SALAD]);
  });

  it("honours an explicit limit", () => {
    expect(
      selectRecommendations(
        [edge(BURGER, FRIES), edge(BURGER, DRINK)],
        [BURGER],
        allOrderable,
        1,
      ),
    ).toHaveLength(1);
  });

  it("collects suggestions from several dishes in the basket", () => {
    const picks = selectRecommendations(
      [edge(BURGER, FRIES), edge(PIZZA, SALAD)],
      [BURGER, PIZZA],
      allOrderable,
    );

    expect(picks).toEqual([
      { sourceProductId: BURGER, recommendedProductId: FRIES },
      { sourceProductId: PIZZA, recommendedProductId: SALAD },
    ]);
  });

  /** Two identical rows is a bug the guest can see. */
  it("offers a dish once even when two sources suggest it", () => {
    const picks = selectRecommendations(
      [edge(BURGER, DRINK), edge(PIZZA, DRINK)],
      [BURGER, PIZZA],
      allOrderable,
    );

    expect(picks).toHaveLength(1);
    // Credited to the dish that appeared first in the basket.
    expect(picks[0]).toEqual({
      sourceProductId: BURGER,
      recommendedProductId: DRINK,
    });
  });

  it("gives the first dish in the basket first call on the slots", () => {
    const picks = selectRecommendations(
      [
        edge(BURGER, FRIES),
        edge(BURGER, DRINK),
        edge(BURGER, SALAD),
        edge(PIZZA, DESSERT),
      ],
      [BURGER, PIZZA],
      allOrderable,
    );

    // The cap is reached before pizza's suggestion is considered.
    expect(picks.map((p) => p.recommendedProductId)).toEqual([FRIES, DRINK, SALAD]);
  });

  it("is deterministic — the same basket always yields the same panel", () => {
    const edges = [edge(BURGER, FRIES), edge(BURGER, DRINK), edge(PIZZA, SALAD)];
    const once = selectRecommendations(edges, [BURGER, PIZZA], allOrderable);
    const twice = selectRecommendations(edges, [BURGER, PIZZA], allOrderable);

    expect(once).toEqual(twice);
  });
});

describe("derivePerformance", () => {
  const base = {
    sourceProductId: BURGER,
    recommendedProductId: FRIES,
    impressions: 1250,
    interactions: 210,
    addedToCart: 190,
    purchases: 150,
    revenue: 12_750_000,
  };

  it("computes the two documented rates", () => {
    const row = derivePerformance(base);

    expect(row.addRate).toBeCloseTo(190 / 1250);
    expect(row.conversionRate).toBeCloseTo(150 / 1250);
  });

  it("reports zero rather than dividing by zero", () => {
    const row = derivePerformance({ ...base, impressions: 0 });

    expect(row.addRate).toBe(0);
    expect(row.conversionRate).toBe(0);
  });

  /**
   * The two ratios mix units — sessions below, order lines above — so they can
   * genuinely exceed 1: a guest shown a suggestion once may buy the dish across
   * several orders, and a phone order is attributed with no impression at all.
   * The counts stay exact; only the unreadable percentage is capped.
   */
  it("caps a rate at 100% rather than reporting 300%", () => {
    const row = derivePerformance({
      ...base,
      impressions: 1,
      addedToCart: 1,
      purchases: 3,
    });

    expect(row.conversionRate).toBe(1);
    expect(row.addRate).toBe(1);
    // …and the underlying counts are untouched, so the discrepancy stays visible.
    expect(row.purchases).toBe(3);
    expect(row.impressions).toBe(1);
  });

  it("passes the counts through untouched", () => {
    expect(derivePerformance(base)).toMatchObject({
      impressions: 1250,
      interactions: 210,
      addedToCart: 190,
      purchases: 150,
      revenue: 12_750_000,
    });
  });
});

describe("rankByRevenue", () => {
  const row = (target: string, revenue: number, purchases = 0, impressions = 0) =>
    derivePerformance({
      sourceProductId: BURGER,
      recommendedProductId: target,
      impressions,
      interactions: 0,
      addedToCart: 0,
      purchases,
      revenue,
    });

  it("puts the highest-earning suggestion first", () => {
    const ranked = rankByRevenue([row(FRIES, 100), row(DRINK, 900), row(SALAD, 500)]);
    expect(ranked.map((r) => r.recommendedProductId)).toEqual([DRINK, SALAD, FRIES]);
  });

  /**
   * Revenue, not conversion rate: a suggestion converting at 80% on four
   * impressions is noise, and the owner is asking what made money.
   */
  it("does not let a high rate on tiny numbers outrank real revenue", () => {
    const noisy = row(SALAD, 1000, 4, 5);
    const earner = row(DRINK, 900_000, 300, 5000);

    expect(rankByRevenue([noisy, earner])[0]!.recommendedProductId).toBe(DRINK);
  });

  it("breaks ties on purchases, then impressions", () => {
    const ranked = rankByRevenue([
      row(FRIES, 500, 2, 10),
      row(DRINK, 500, 5, 10),
      row(SALAD, 500, 2, 99),
    ]);

    expect(ranked.map((r) => r.recommendedProductId)).toEqual([DRINK, SALAD, FRIES]);
  });

  it("does not mutate its input", () => {
    const rows = [row(FRIES, 100), row(DRINK, 900)];
    rankByRevenue(rows);
    expect(rows.map((r) => r.recommendedProductId)).toEqual([FRIES, DRINK]);
  });
});
