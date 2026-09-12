import { describe, expect, it } from "vitest";
import { DiscountCodeInput, discountAmountFor, normaliseCode } from "./discounts";

/**
 * A discount code is the one figure on a bill that a *guest* supplies, which
 * makes it the one place a typo or a hostile value turns into money. Everything
 * here is pure, so the arithmetic that decides what a customer is charged can be
 * checked without a database.
 */

describe("normaliseCode", () => {
  it("matches regardless of how the guest typed it", () => {
    // Codes get printed on table cards and read back by someone holding a
    // phone. Case is not a meaningful part of the identity.
    expect(normaliseCode("  save10 ")).toBe("SAVE10");
    expect(normaliseCode("Save10")).toBe(normaliseCode("SAVE10"));
  });

  it("collapses inner whitespace rather than treating it as a different code", () => {
    expect(normaliseCode("SAVE 10")).toBe("SAVE10");
  });
});

describe("discountAmountFor", () => {
  const subtotal = 200_000;

  it("takes a percentage of the basket", () => {
    expect(discountAmountFor(subtotal, { type: "PERCENT", value: 10 })).toBe(20_000);
  });

  it("takes a fixed amount as written", () => {
    expect(discountAmountFor(subtotal, { type: "FIXED", value: 35_000 })).toBe(35_000);
  });

  it("never exceeds the basket, whichever kind it is", () => {
    // Otherwise the total goes negative and takes the tax base with it — the
    // same reason calculatePrice clamps the discount it is handed.
    expect(discountAmountFor(50_000, { type: "FIXED", value: 90_000 })).toBe(50_000);
    expect(discountAmountFor(50_000, { type: "PERCENT", value: 100 })).toBe(50_000);
  });

  it("returns whole Toman, because the column is an Int", () => {
    // 33% of 10,001 is 3300.33; a fractional discount would round somewhere
    // else later and the order would not add up.
    const amount = discountAmountFor(10_001, { type: "PERCENT", value: 33 });
    expect(Number.isInteger(amount)).toBe(true);
    expect(amount).toBe(3300);
  });

  it("is nothing on an empty or nonsensical basket", () => {
    expect(discountAmountFor(0, { type: "PERCENT", value: 50 })).toBe(0);
    expect(discountAmountFor(-100, { type: "FIXED", value: 50 })).toBe(0);
  });

  /**
   * A percentage with a ceiling: "15% off, but never more than 150,000".
   *
   * Without it a 15% code is unbounded — the bigger the basket, the more the
   * venue gives away, and a large party order can cost far more than the
   * promotion was meant to.
   */
  describe("with a maximum", () => {
    it("caps the percentage once the basket is large enough", () => {
      // 15% of 2,000,000 is 300,000, which the ceiling cuts to 150,000.
      expect(
        discountAmountFor(2_000_000, {
          type: "PERCENT",
          value: 15,
          maxDiscount: 150_000,
        }),
      ).toBe(150_000);
    });

    it("leaves a small basket alone, where the percentage is under the cap", () => {
      // 15% of 400,000 is 60,000 — below the ceiling, so the guest gets the
      // full percentage rather than a flat amount.
      expect(
        discountAmountFor(400_000, { type: "PERCENT", value: 15, maxDiscount: 150_000 }),
      ).toBe(60_000);
    });

    it("gives exactly the cap at the crossover point", () => {
      // 15% of 1,000,000 is exactly 150,000.
      expect(
        discountAmountFor(1_000_000, {
          type: "PERCENT",
          value: 15,
          maxDiscount: 150_000,
        }),
      ).toBe(150_000);
    });

    it("ignores a cap on a fixed-amount code", () => {
      // A fixed code is already a flat number; a ceiling on it would be a
      // second way of writing the same thing and a way for the two to disagree.
      expect(
        discountAmountFor(900_000, { type: "FIXED", value: 80_000, maxDiscount: 10_000 }),
      ).toBe(80_000);
    });

    it("treats a missing or zero cap as no cap", () => {
      expect(discountAmountFor(2_000_000, { type: "PERCENT", value: 15 })).toBe(300_000);
      expect(
        discountAmountFor(2_000_000, { type: "PERCENT", value: 15, maxDiscount: 0 }),
      ).toBe(300_000);
      expect(
        discountAmountFor(2_000_000, { type: "PERCENT", value: 15, maxDiscount: null }),
      ).toBe(300_000);
    });

    it("still never exceeds the basket", () => {
      expect(
        discountAmountFor(20_000, { type: "PERCENT", value: 100, maxDiscount: 500_000 }),
      ).toBe(20_000);
    });
  });

  it("stacks on top of a product that is already reduced", () => {
    /*
      Nothing special is needed for this and that is the point: `subtotal` is
      already the sum of the prices actually charged, so a product sold below
      its compare-at price arrives here discounted and the code comes off what
      remains. The two reductions compound rather than competing.
    */
    const alreadyReduced = 90_000; // a 100,000 dish on offer at 90,000
    expect(discountAmountFor(alreadyReduced, { type: "PERCENT", value: 10 })).toBe(9_000);
  });
});

describe("DiscountCodeInput", () => {
  it("accepts a percentage between 1 and 100", () => {
    expect(
      DiscountCodeInput.safeParse({ code: "SAVE10", type: "PERCENT", value: 10 }).success,
    ).toBe(true);
    expect(
      DiscountCodeInput.safeParse({ code: "ALL", type: "PERCENT", value: 100 }).success,
    ).toBe(true);
  });

  it("rejects a percentage above 100, which would owe the guest money", () => {
    expect(
      DiscountCodeInput.safeParse({ code: "OOPS", type: "PERCENT", value: 101 }).success,
    ).toBe(false);
  });

  it("rejects a zero or negative value of either kind", () => {
    expect(
      DiscountCodeInput.safeParse({ code: "ZERO", type: "PERCENT", value: 0 }).success,
    ).toBe(false);
    expect(
      DiscountCodeInput.safeParse({ code: "NEG", type: "FIXED", value: -5 }).success,
    ).toBe(false);
  });

  it("stores the code in its normalised form", () => {
    const parsed = DiscountCodeInput.safeParse({
      code: " save10 ",
      type: "PERCENT",
      value: 10,
    });
    expect(parsed.success && parsed.data.code).toBe("SAVE10");
  });

  it("accepts a maximum on a percentage code", () => {
    expect(
      DiscountCodeInput.safeParse({
        code: "SAVE15",
        type: "PERCENT",
        value: 15,
        maxDiscount: 150_000,
      }).success,
    ).toBe(true);
  });

  it("refuses a maximum on a fixed-amount code", () => {
    // Capping a flat amount is either a no-op or a contradiction; refusing it
    // stops a code being stored that reads as two different offers.
    expect(
      DiscountCodeInput.safeParse({
        code: "FLAT",
        type: "FIXED",
        value: 50_000,
        maxDiscount: 10_000,
      }).success,
    ).toBe(false);
  });

  it("refuses a zero or negative maximum", () => {
    // "No more than nothing" is a code that can never discount anything;
    // leaving the field empty is how you say there is no ceiling.
    expect(
      DiscountCodeInput.safeParse({
        code: "ZEROCAP",
        type: "PERCENT",
        value: 15,
        maxDiscount: 0,
      }).success,
    ).toBe(false);
  });

  it("refuses a code that is only punctuation, so it can still be read aloud", () => {
    expect(
      DiscountCodeInput.safeParse({ code: "---", type: "FIXED", value: 5000 }).success,
    ).toBe(false);
  });
});
