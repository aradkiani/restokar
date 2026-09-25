import { describe, expect, it } from "vitest";
import {
  bundleSaving,
  componentsTotal,
  isBundle,
  isBundleOrderable,
  normaliseComponents,
  resolveBundle,
} from "./bundles";

const BURGER = "p-burger";
const FRIES = "p-fries";
const COLA = "p-drink";
const GONE = "p-deleted";

const PRICES: Record<string, number> = {
  [BURGER]: 180_000,
  [FRIES]: 60_000,
  [COLA]: 40_000,
};

const priceOf = (id: string) => PRICES[id] ?? null;

const combo = [
  { productId: BURGER, quantity: 1 },
  { productId: FRIES, quantity: 1 },
  { productId: COLA, quantity: 1 },
];

const allOrderable = new Set([BURGER, FRIES, COLA]);

describe("normaliseComponents", () => {
  it("folds a repeated product into one line with the summed quantity", () => {
    expect(
      normaliseComponents([
        { productId: BURGER, quantity: 1 },
        { productId: FRIES, quantity: 1 },
        { productId: BURGER, quantity: 1 },
      ]),
    ).toEqual([
      { productId: BURGER, quantity: 2 },
      { productId: FRIES, quantity: 1 },
    ]);
  });

  it("keeps the owner's ordering by first appearance", () => {
    expect(
      normaliseComponents([
        { productId: COLA, quantity: 1 },
        { productId: BURGER, quantity: 1 },
      ]).map((c) => c.productId),
    ).toEqual([COLA, BURGER]);
  });

  /** A component the bundle contains none of is not a component. */
  it("drops non-positive quantities", () => {
    expect(
      normaliseComponents([
        { productId: BURGER, quantity: 0 },
        { productId: FRIES, quantity: -2 },
        { productId: COLA, quantity: 1 },
      ]),
    ).toEqual([{ productId: COLA, quantity: 1 }]);
  });
});

describe("componentsTotal", () => {
  it("sums quantity times price in whole Toman", () => {
    expect(componentsTotal(combo, priceOf)).toBe(280_000);
  });

  it("counts a doubled component twice", () => {
    expect(componentsTotal([{ productId: FRIES, quantity: 2 }], priceOf)).toBe(120_000);
  });

  /**
   * A smaller number that looks like a real total is worse than no total: the
   * surface shows the bundle without a saving rather than understating it.
   */
  it("refuses to total a bundle containing a product that is gone", () => {
    expect(componentsTotal([...combo, { productId: GONE, quantity: 1 }], priceOf)).toBe(
      null,
    );
  });

  it("totals an empty list as zero", () => {
    expect(componentsTotal([], priceOf)).toBe(0);
  });
});

describe("bundleSaving", () => {
  it("reports the difference from buying separately", () => {
    expect(bundleSaving(240_000, combo, priceOf)).toBe(40_000);
  });

  /** «۰ تومان صرفه‌جویی» draws attention to the absence of a deal. */
  it("reports nothing when the bundle costs exactly its parts", () => {
    expect(bundleSaving(280_000, combo, priceOf)).toBe(null);
  });

  it("reports nothing when the bundle costs more than its parts", () => {
    expect(bundleSaving(300_000, combo, priceOf)).toBe(null);
  });

  it("reports nothing when the total cannot be computed", () => {
    expect(bundleSaving(100_000, [{ productId: GONE, quantity: 1 }], priceOf)).toBe(null);
  });

  it("stays an integer", () => {
    const saving = bundleSaving(239_999, combo, priceOf);
    expect(Number.isInteger(saving)).toBe(true);
  });
});

describe("isBundleOrderable", () => {
  it("allows a bundle whose every component can be ordered", () => {
    expect(isBundleOrderable(true, combo, allOrderable)).toBe(true);
  });

  /** A combo whose chips are sold out is not a combo. */
  it("refuses a bundle with a sold-out component", () => {
    expect(isBundleOrderable(true, combo, new Set([BURGER, COLA]))).toBe(false);
  });

  it("refuses a bundle that is itself unavailable", () => {
    expect(isBundleOrderable(false, combo, allOrderable)).toBe(false);
  });

  it("refuses a bundle containing a product no longer on the menu", () => {
    expect(
      isBundleOrderable(true, [{ productId: GONE, quantity: 1 }], allOrderable),
    ).toBe(false);
  });

  /** An unfinished product, not a broken bundle. */
  it("allows a product with no components on its own merits", () => {
    expect(isBundleOrderable(true, [], allOrderable)).toBe(true);
    expect(isBundleOrderable(false, [], allOrderable)).toBe(false);
  });
});

describe("resolveBundle", () => {
  it("answers all three questions at once", () => {
    expect(
      resolveBundle({
        price: 240_000,
        isAvailable: true,
        components: combo,
        priceOf,
        orderableProductIds: allOrderable,
      }),
    ).toEqual({
      components: combo,
      saving: 40_000,
      isOrderable: true,
    });
  });

  it("still reports the saving on a bundle that cannot be assembled", () => {
    const resolved = resolveBundle({
      price: 240_000,
      isAvailable: true,
      components: combo,
      priceOf,
      orderableProductIds: new Set([BURGER]),
    });

    // The deal is real; it is just not available right now. A surface needs
    // both facts to decide between hiding it and disabling it.
    expect(resolved.saving).toBe(40_000);
    expect(resolved.isOrderable).toBe(false);
  });

  it("folds duplicates before answering", () => {
    const resolved = resolveBundle({
      price: 100_000,
      isAvailable: true,
      components: [
        { productId: FRIES, quantity: 1 },
        { productId: FRIES, quantity: 1 },
      ],
      priceOf,
      orderableProductIds: allOrderable,
    });

    expect(resolved.components).toEqual([{ productId: FRIES, quantity: 2 }]);
    expect(resolved.saving).toBe(20_000);
  });

  it("is deterministic", () => {
    const input = {
      price: 240_000,
      isAvailable: true,
      components: combo,
      priceOf,
      orderableProductIds: allOrderable,
    };

    expect(resolveBundle(input)).toEqual(resolveBundle(input));
  });
});

describe("isBundle", () => {
  it("is true once a product lists a component", () => {
    expect(isBundle(combo)).toBe(true);
  });

  it("is false for an ordinary dish", () => {
    expect(isBundle([])).toBe(false);
  });

  it("is false when every listed component has no quantity", () => {
    expect(isBundle([{ productId: BURGER, quantity: 0 }])).toBe(false);
  });
});
