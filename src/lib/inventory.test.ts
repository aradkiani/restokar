import { describe, expect, it } from "vitest";
import {
  UNIT_DECIMALS,
  consumptionFor,
  formatQuantity,
  fromMilli,
  isLowStock,
  parseQuantity,
  toMilli,
} from "./inventory";

/**
 * Stock is counted in thousandths of whatever unit the owner declared, held in
 * an Int column — the same discipline the money code uses, for the same reason.
 * A kitchen deals in 0.25 kg and 1.5 L, and floating point would drift a little
 * on every order until the number on screen stopped matching the shelf.
 */

describe("toMilli / fromMilli", () => {
  it("round-trips a fractional quantity", () => {
    expect(toMilli(1.5)).toBe(1500);
    expect(fromMilli(1500)).toBe(1.5);
  });

  it("keeps three decimals, which is a gram in a kilogram", () => {
    expect(toMilli(0.001)).toBe(1);
    expect(UNIT_DECIMALS).toBe(3);
  });

  it("rounds rather than truncating below the smallest step", () => {
    expect(toMilli(0.0004)).toBe(0);
    expect(toMilli(0.0006)).toBe(1);
  });

  it("treats nonsense as zero rather than NaN", () => {
    // A NaN would propagate into an Int column and fail the insert.
    expect(toMilli(Number.NaN)).toBe(0);
    expect(toMilli(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("never returns a negative stock figure from a negative input", () => {
    expect(toMilli(-5)).toBe(0);
  });
});

describe("parseQuantity", () => {
  it("accepts Persian digits, because that is what the panel types", () => {
    // The same trap the discount form hit: Number("۲٫۵") is NaN.
    expect(parseQuantity("۲")).toBe(2000);
    expect(parseQuantity("۱۰")).toBe(10_000);
  });

  it("accepts a decimal written with either separator", () => {
    expect(parseQuantity("1.5")).toBe(1500);
    expect(parseQuantity("۱٫۵")).toBe(1500);
  });

  it("ignores thousands separators pasted in with an amount", () => {
    expect(parseQuantity("1,250")).toBe(1_250_000);
    expect(parseQuantity("۱٬۲۵۰")).toBe(1_250_000);
  });

  it("is zero for an empty or unreadable entry", () => {
    expect(parseQuantity("")).toBe(0);
    expect(parseQuantity("abc")).toBe(0);
  });
});

describe("formatQuantity", () => {
  it("drops trailing zeros so 2.000 reads as 2", () => {
    expect(formatQuantity(2000)).toBe("2");
    expect(formatQuantity(1500)).toBe("1.5");
    expect(formatQuantity(250)).toBe("0.25");
  });
});

describe("isLowStock", () => {
  it("warns before the shelf is empty, not when it already is", () => {
    // The whole point: an owner needs to reorder while there is still some
    // left, so the threshold fires above zero.
    expect(isLowStock({ quantityMilli: 2000, lowStockMilli: 3000 })).toBe(true);
    expect(isLowStock({ quantityMilli: 4000, lowStockMilli: 3000 })).toBe(false);
  });

  it("warns at exactly the threshold", () => {
    expect(isLowStock({ quantityMilli: 3000, lowStockMilli: 3000 })).toBe(true);
  });

  it("warns when stock has run out entirely", () => {
    expect(isLowStock({ quantityMilli: 0, lowStockMilli: 3000 })).toBe(true);
  });

  it("says nothing when no threshold has been set", () => {
    // Zero means "do not watch this item" rather than "warn always" — an owner
    // who has not thought about an ingredient should not be nagged about it.
    expect(isLowStock({ quantityMilli: 0, lowStockMilli: 0 })).toBe(false);
  });
});

describe("consumptionFor", () => {
  const recipes = [
    { productId: "burger", itemId: "beef", perUnitMilli: 180_000 }, // 180 g
    { productId: "burger", itemId: "bun", perUnitMilli: 1000 }, // 1 piece
    { productId: "fries", itemId: "potato", perUnitMilli: 200_000 },
  ];

  it("multiplies each ingredient by the number of dishes ordered", () => {
    expect(consumptionFor([{ productId: "burger", quantity: 3 }], recipes)).toEqual({
      beef: 540_000,
      bun: 3000,
    });
  });

  it("adds up an ingredient shared by two dishes on the same order", () => {
    const shared = [
      { productId: "burger", itemId: "oil", perUnitMilli: 10_000 },
      { productId: "fries", itemId: "oil", perUnitMilli: 30_000 },
    ];
    expect(
      consumptionFor(
        [
          { productId: "burger", quantity: 2 },
          { productId: "fries", quantity: 1 },
        ],
        shared,
      ),
    ).toEqual({ oil: 50_000 });
  });

  it("is empty for dishes that have no recipe recorded", () => {
    // Recipes are optional per dish, so a venue can track only what matters.
    expect(consumptionFor([{ productId: "salad", quantity: 5 }], recipes)).toEqual({});
  });

  it("is empty for an order with no lines", () => {
    expect(consumptionFor([], recipes)).toEqual({});
  });
});
