import { describe, expect, it } from "vitest";
import {
  adjustAll,
  adjustExact,
  MAX_BULK_PERCENT,
  MIN_BULK_PERCENT,
  PRICE_ROUNDING_STEPS,
  summarise,
  type PricedItem,
} from "./bulk-pricing";

/**
 * This rewrites every price on a menu in one action. The preview an owner
 * approves is produced by the same function that writes the values, so these
 * tests are what stands between "put everything up 10%" and a menu full of
 * wrong numbers.
 */

const item = (price: number, overrides: Partial<PricedItem> = {}): PricedItem => ({
  id: `p${price}`,
  name: "dish",
  price,
  priceExact: price,
  ...overrides,
});

const one = (priced: PricedItem, percent: number, step: number) =>
  adjustAll([priced], { percent, step })[0]!;

describe("adjustExact", () => {
  it("moves the exact price by the percentage, without rounding", () => {
    expect(adjustExact(275_500, 10)).toBe(303_050);
    expect(adjustExact(33_333, 7)).toBeCloseTo(35_666.31, 2);
  });

  it("keeps a free item free", () => {
    expect(adjustExact(0, 10)).toBe(0);
  });

  it("handles a decrease", () => {
    expect(adjustExact(300_000, -10)).toBe(270_000);
  });

  it("is a no-op at zero percent", () => {
    expect(adjustExact(123_456.789, 0)).toBe(123_456.789);
  });
});

describe("rounding happens after the arithmetic, never inside it", () => {
  it("shows the worked example at the nearest step", () => {
    // 250,000 +10% is 275,000 exactly, shown at the nearest 10,000: 280,000.
    const r = one(item(250_000), 10, 10_000);
    expect(r.nextPriceExact).toBe(275_000);
    expect(r.nextPrice).toBe(280_000);
  });

  /**
   * The reason this module changed. Compounding on the *shown* price drifts
   * away from where the increases actually put the menu; compounding on the
   * exact price does not.
   */
  it("compounds a second increase on the exact price, not the shown one", () => {
    const first = one(item(250_000), 10, 10_000);
    const second = one(
      item(first.nextPrice, { priceExact: first.nextPriceExact }),
      10,
      10_000,
    );

    // Exact: 275,000 × 1.1 = 302,500 → shown 300,000.
    // The old behaviour compounded on 280,000 → 308,000 → shown 310,000.
    expect(second.nextPriceExact).toBe(302_500);
    expect(second.nextPrice).toBe(300_000);
  });

  it("stays equal to one combined increase however many steps it takes", () => {
    let current = item(250_000);
    for (let i = 0; i < 5; i += 1) {
      const next = one(current, 10, 5_000);
      current = item(next.nextPrice, { priceExact: next.nextPriceExact });
    }
    expect(current.priceExact).toBeCloseTo(250_000 * 1.1 ** 5, 2);
  });

  it("shows whole Toman when the venue does not round", () => {
    const r = one(item(33_333), 7, 0);
    expect(Number.isInteger(r.nextPrice)).toBe(true);
    expect(r.nextPrice).toBe(35_666);
  });

  it("never shows a priced item as free", () => {
    // 300 +10% = 330; the nearest 10,000 is 0, which would make a paid side
    // dish free. It is shown at its own price instead.
    expect(one(item(300), 10, 10_000).nextPrice).toBe(330);
  });

  it("keeps a free item free at any step", () => {
    expect(one(item(0), 10, 10_000).nextPrice).toBe(0);
  });

  it("offers 0 as a step, meaning no rounding", () => {
    expect(PRICE_ROUNDING_STEPS[0]).toBe(0);
  });

  it("bounds the percentage on both sides", () => {
    expect(MIN_BULK_PERCENT).toBeLessThan(0);
    expect(MAX_BULK_PERCENT).toBeGreaterThan(0);
  });
});

describe("the 'was' price", () => {
  it("moves by the same percentage from its own exact figure", () => {
    const r = one(
      item(200_000, { compareAtPrice: 250_000, compareAtPriceExact: 250_000 }),
      20,
      10_000,
    );
    expect(r.nextPriceExact).toBe(240_000);
    expect(r.nextCompareAtPriceExact).toBe(300_000);
    expect(r.nextCompareAtPrice).toBe(300_000);
  });

  it("preserves the size of the discount", () => {
    const r = one(item(200_000, { compareAtPrice: 250_000 }), 20, 10_000);
    const before = 1 - 200_000 / 250_000;
    const after = 1 - r.nextPrice / r.nextCompareAtPrice!;
    expect(after).toBeCloseTo(before, 2);
  });

  it("never lets rounding collapse a discount", () => {
    // 98,000 and 100,000 both round to 110,000 at a 10,000 step after +10%.
    const r = one(item(98_000, { compareAtPrice: 100_000 }), 10, 10_000);
    expect(r.nextCompareAtPrice!).toBeGreaterThan(r.nextPrice);
  });

  it("keeps the strike-through above the price in the worst case", () => {
    const r = one(item(100_000, { compareAtPrice: 100_001 }), 0, 50_000);
    expect(r.nextCompareAtPrice!).toBeGreaterThan(r.nextPrice);
  });

  it("leaves an item with no discount alone", () => {
    const r = one(item(100_000), 10, 10_000);
    expect(r.nextCompareAtPrice).toBeNull();
    expect(r.nextCompareAtPriceExact).toBeNull();
  });

  it("does not defend the ordering when no discount was showing", () => {
    // A 'was' price at or below the price displays nothing either way.
    const r = one(item(100_000, { compareAtPrice: 90_000 }), 10, 10_000);
    expect(r.nextCompareAtPrice).toBe(100_000);
  });
});

describe("adjustAll / summarise", () => {
  const items = [
    item(45_000, { id: "a", name: "چای" }),
    item(250_000, { id: "b", name: "کیک" }),
    item(0, { id: "c", name: "آب" }),
  ];

  it("flags only the rows that actually move", () => {
    const adjusted = adjustAll(items, { percent: 10, step: 10_000 });
    expect(adjusted.map((i) => i.nextPrice)).toEqual([50_000, 280_000, 0]);
    expect(adjusted.map((i) => i.changed)).toEqual([true, true, false]);
  });

  /** The exact price is a stored figure too; moving it is a change. */
  it("counts a row whose exact price moves even if its shown price does not", () => {
    const [r] = adjustAll([item(250_000)], { percent: 1, step: 10_000 });
    expect(r!.nextPrice).toBe(250_000);
    expect(r!.nextPriceExact).toBe(252_500);
    expect(r!.changed).toBe(true);
  });

  it("summarises the direction of the change", () => {
    const summary = summarise(adjustAll(items, { percent: 10, step: 10_000 }));
    expect(summary.total).toBe(3);
    expect(summary.changed).toBe(2);
    expect(summary.before).toBe(295_000);
    expect(summary.after).toBe(330_000);
  });

  it("reports no changes for a zero-percent no-op", () => {
    const summary = summarise(adjustAll(items, { percent: 0, step: 0 }));
    expect(summary.changed).toBe(0);
    expect(summary.before).toBe(summary.after);
  });
});
