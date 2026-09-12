import { describe, expect, it } from "vitest";
import {
  adjustAll,
  adjustCompareAt,
  adjustPrice,
  MAX_BULK_PERCENT,
  MIN_BULK_PERCENT,
  PRICE_ROUNDING_STEPS,
  summarise,
} from "./bulk-pricing";

/**
 * This rewrites every price on a menu in one action. The preview an owner
 * approves is produced by the same function that writes the values, so these
 * tests are what stands between "put everything up 10%" and a menu full of
 * wrong numbers.
 */

describe("adjustPrice", () => {
  it("raises and rounds to the nearest step", () => {
    // The worked example: 250,000 +10% is 275,000, nearest 10,000 is 280,000.
    expect(adjustPrice(250_000, { percent: 10, roundTo: 10_000 })).toBe(280_000);
  });

  it("rounds down when that is nearer", () => {
    // 300,000 +10% = 330,000 — already on the step.
    expect(adjustPrice(300_000, { percent: 10, roundTo: 10_000 })).toBe(330_000);
    // 260,000 +10% = 286,000 → nearest 10,000 is 290,000.
    expect(adjustPrice(260_000, { percent: 10, roundTo: 10_000 })).toBe(290_000);
    // 262,000 +10% = 288,200 → 290,000.
    expect(adjustPrice(262_000, { percent: 10, roundTo: 10_000 })).toBe(290_000);
    // 240,000 +10% = 264,000 → 260,000, which is the nearer step.
    expect(adjustPrice(240_000, { percent: 10, roundTo: 10_000 })).toBe(260_000);
  });

  it("applies the percentage before rounding, not after", () => {
    // Rounding first would give 280,000 × 1.1 = 308,000 → 310,000, which is a
    // different and wrong answer.
    expect(adjustPrice(275_500, { percent: 10, roundTo: 10_000 })).toBe(300_000);
  });

  it("leaves prices alone when rounding is off", () => {
    expect(adjustPrice(275_500, { percent: 10, roundTo: 0 })).toBe(303_050);
  });

  it("keeps a free item free", () => {
    // Rounding 0 up to a step would put a price on something given away.
    expect(adjustPrice(0, { percent: 10, roundTo: 10_000 })).toBe(0);
  });

  it("never rounds a priced item down to nothing", () => {
    // 300 +10% = 330; nearest 10,000 is 0, which would make a paid side dish
    // free. It keeps its computed price instead.
    expect(adjustPrice(300, { percent: 10, roundTo: 10_000 })).toBe(330);
    expect(adjustPrice(300, { percent: 10, roundTo: 10_000 })).toBeGreaterThan(0);
  });

  it("handles a decrease", () => {
    expect(adjustPrice(300_000, { percent: -10, roundTo: 5_000 })).toBe(270_000);
  });

  it("returns whole Toman, never a fraction", () => {
    // Every money column in the schema is an integer.
    const result = adjustPrice(33_333, { percent: 7, roundTo: 0 });
    expect(Number.isInteger(result)).toBe(true);
  });

  it("is a no-op at zero percent with rounding off", () => {
    expect(adjustPrice(123_456, { percent: 0, roundTo: 0 })).toBe(123_456);
  });

  it("offers 0 as a rounding step, meaning no rounding", () => {
    expect(PRICE_ROUNDING_STEPS[0]).toBe(0);
  });

  it("bounds the percentage on both sides", () => {
    expect(MIN_BULK_PERCENT).toBeLessThan(0);
    expect(MAX_BULK_PERCENT).toBeGreaterThan(0);
  });
});

describe("adjustCompareAt", () => {
  const at10 = { percent: 10, roundTo: 10_000 };

  it("raises the 'was' price by the same percentage", () => {
    // 250,000 +10% = 275,000 → nearest 10,000 = 280,000, exactly as the price
    // itself would be treated.
    expect(adjustCompareAt(250_000, 200_000, 240_000, at10)).toBe(280_000);
  });

  it("preserves the size of the discount", () => {
    // 200,000 off 250,000 is 20%. After a 20% rise it must still be ~20%,
    // not the 4% you get by raising only the price.
    const input = { percent: 20, roundTo: 10_000 };
    const nextPrice = adjustPrice(200_000, input); // 240,000
    const nextWas = adjustCompareAt(250_000, 200_000, nextPrice, input)!; // 300,000
    const before = 1 - 200_000 / 250_000;
    const after = 1 - nextPrice / nextWas;
    expect(nextPrice).toBe(240_000);
    expect(nextWas).toBe(300_000);
    expect(after).toBeCloseTo(before, 2);
  });

  it("never lets rounding collapse a discount", () => {
    // Both round to 120,000 at a 10,000 step, which would erase the offer.
    const nextPrice = adjustPrice(98_000, at10); // 110,000
    const nextWas = adjustCompareAt(100_000, 98_000, nextPrice, at10)!;
    expect(nextWas).toBeGreaterThan(nextPrice);
  });

  it("keeps the strike-through above the price even in the worst case", () => {
    // Adjacent values, where even the unrounded raise ties.
    const input = { percent: 0, roundTo: 0 };
    const nextPrice = adjustPrice(100_000, input);
    const nextWas = adjustCompareAt(100_001, 100_000, nextPrice, input)!;
    expect(nextWas).toBeGreaterThan(nextPrice);
  });

  it("leaves an item with no discount alone", () => {
    expect(adjustCompareAt(null, 100_000, 110_000, at10)).toBeNull();
  });

  it("does not defend the ordering when no discount was showing", () => {
    // A 'was' price at or below the price displays nothing either way, so it
    // is simply scaled rather than forced above the new price.
    expect(adjustCompareAt(90_000, 100_000, 110_000, at10)).toBe(100_000);
  });
});

describe("adjustAll / summarise", () => {
  const items = [
    { id: "a", name: "چای", price: 45_000 },
    { id: "b", name: "کیک", price: 250_000 },
    { id: "c", name: "آب", price: 0 },
  ];

  it("flags only the rows that actually move", () => {
    const adjusted = adjustAll(items, { percent: 10, roundTo: 10_000 });
    expect(adjusted.map((i) => i.nextPrice)).toEqual([50_000, 280_000, 0]);
    expect(adjusted.map((i) => i.changed)).toEqual([true, true, false]);
  });

  it("summarises the direction of the change", () => {
    const summary = summarise(adjustAll(items, { percent: 10, roundTo: 10_000 }));
    expect(summary.total).toBe(3);
    expect(summary.changed).toBe(2);
    expect(summary.before).toBe(295_000);
    expect(summary.after).toBe(330_000);
    expect(summary.after).toBeGreaterThan(summary.before);
  });

  it("reports no changes for a zero-percent no-op", () => {
    const summary = summarise(adjustAll(items, { percent: 0, roundTo: 0 }));
    expect(summary.changed).toBe(0);
    expect(summary.before).toBe(summary.after);
  });
});
