import { describe, expect, it } from "vitest";
import {
  DISCOUNT_REJECTIONS,
  DiscountCodeInput,
  type DiscountRecord,
  discountAmountFor,
  evaluateDiscount,
  normaliseCode,
} from "./discounts";

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

describe("evaluateDiscount", () => {
  const live: DiscountRecord = {
    code: "SAVE10",
    type: "PERCENT",
    value: 10,
    maxDiscount: null,
    isActive: true,
  };

  const evaluate = (over: Partial<Parameters<typeof evaluateDiscount>[0]> = {}) =>
    evaluateDiscount({
      enabled: true,
      raw: "SAVE10",
      subtotal: 200_000,
      found: live,
      ...over,
    });

  it("returns the amount and the stored spelling of the code", () => {
    // The stored spelling, not the guest's: it goes onto the order and onto
    // the owner's report, where two spellings of one code would read as two.
    expect(evaluate({ raw: "  save10 " })).toEqual({
      ok: true,
      code: "SAVE10",
      amount: 20_000,
    });
  });

  it("agrees with discountAmountFor rather than computing its own figure", () => {
    const result = evaluate({ subtotal: 137_000 });
    expect(result).toEqual({
      ok: true,
      code: "SAVE10",
      amount: discountAmountFor(137_000, live),
    });
  });

  describe("rejection reasons", () => {
    it("refuses when the venue does not take codes", () => {
      expect(evaluate({ enabled: false })).toEqual({
        ok: false,
        reason: "DISABLED",
      });
    });

    it("refuses an empty field before anything else is considered", () => {
      for (const raw of ["", "   ", null, undefined]) {
        expect(evaluate({ raw })).toEqual({ ok: false, reason: "EMPTY" });
      }
    });

    it("refuses a code with no letter or digit in it", () => {
      // Matches what DiscountCodeInput refuses on the owner's side, so a string
      // that could never have been saved is not reported as "no such code".
      expect(evaluate({ raw: " - - - " })).toEqual({
        ok: false,
        reason: "MALFORMED",
      });
    });

    it("refuses a code this venue does not have", () => {
      expect(evaluate({ found: null })).toEqual({
        ok: false,
        reason: "NOT_FOUND",
      });
    });

    it("gives a switched-off code the same answer as a missing one", () => {
      /*
        Deliberate, and the single most important assertion in this block.
        Distinguishing the two would confirm which codes exist, and this
        function backs a preview a guest can call repeatedly without ever
        placing an order — so "that one is switched off" is an enumeration
        oracle. orders.ts merges them for the same reason.
      */
      const switchedOff = { ...live, isActive: false };
      expect(evaluate({ found: switchedOff })).toEqual(evaluate({ found: null }));
    });

    it("refuses when there is nothing in the basket to discount", () => {
      expect(evaluate({ subtotal: 0 })).toEqual({ ok: false, reason: "NO_BASKET" });
    });

    it("refuses a live code that is worth nothing on this basket", () => {
      // A stored value of zero is not reachable through DiscountCodeInput, but
      // a row predating that schema — or edited by hand — must not present the
      // guest with a successful discount of nothing.
      expect(evaluate({ found: { ...live, value: 0 } })).toEqual({
        ok: false,
        reason: "NO_VALUE",
      });
    });

    it("reports the first thing actually wrong, not a consequence of it", () => {
      // Disabled venue *and* an empty basket: the venue is the reason, because
      // fixing the basket would change nothing.
      expect(evaluate({ enabled: false, subtotal: 0, raw: "" })).toEqual({
        ok: false,
        reason: "DISABLED",
      });
    });
  });

  it("never answers with a reason the schema cannot support", () => {
    /*
      DiscountCode stores code, type, value, maxDiscount and isActive. There is
      no expiry, no start date, no per-code minimum, no usage counter and no
      product scoping, so there is no honest way to answer "expired" or "usage
      limit reached". This pins the list: adding a member here without the
      column behind it produces a message that is never true.
    */
    expect([...DISCOUNT_REJECTIONS]).toEqual([
      "DISABLED",
      "EMPTY",
      "MALFORMED",
      "NOT_FOUND",
      "NO_BASKET",
      "NO_VALUE",
    ]);
  });
});
