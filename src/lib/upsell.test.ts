import { describe, expect, it } from "vitest";
import type { ProductPairCounts } from "./co-occurrence";
import { MAX_PUBLIC_RECOMMENDATIONS } from "./recommendations";
import { bundlesFor, selectUpsells, type BundleOffer, type UpsellInputs } from "./upsell";

const BURGER = "p-burger";
const PIZZA = "p-pizza";
const FRIES = "p-fries";
const COLA = "p-drink";
const SALAD = "p-salad";
const CAKE = "p-cake";
const COMBO = "p-combo";

const allOrderable = new Set([BURGER, PIZZA, FRIES, COLA, SALAD, CAKE, COMBO]);

const edge = (sourceProductId: string, recommendedProductId: string) => ({
  sourceProductId,
  recommendedProductId,
});

/** Counts that comfortably clear every bar in `co-occurrence.ts`. */
const pair = (
  sourceProductId: string,
  targetProductId: string,
  over: Partial<ProductPairCounts> = {},
): ProductPairCounts => ({
  sourceProductId,
  targetProductId,
  pairCount: 40,
  sourceSupport: 100,
  targetSupport: 120,
  totalOrders: 1000,
  ...over,
});

const bundle = (
  productId: string,
  componentProductIds: string[],
  saving: number | null = 40_000,
): BundleOffer => ({ productId, componentProductIds, saving });

const inputs = (over: Partial<UpsellInputs> = {}): UpsellInputs => ({
  sourceProductIds: [BURGER],
  basketProductIds: [BURGER],
  orderableProductIds: allOrderable,
  ...over,
});

describe("the shared rules", () => {
  it("suggests nothing when there is nothing to suggest", () => {
    expect(selectUpsells(inputs())).toEqual([]);
  });

  it("never suggests something already in the basket", () => {
    const picks = selectUpsells(
      inputs({
        basketProductIds: [BURGER, FRIES],
        pairings: [edge(BURGER, FRIES), edge(BURGER, COLA)],
      }),
    );

    expect(picks.map((p) => p.productId)).toEqual([COLA]);
  });

  /** A stale browser must never make an unavailable dish look purchasable. */
  it("never suggests a dish that cannot be ordered right now", () => {
    const picks = selectUpsells(
      inputs({
        pairings: [edge(BURGER, FRIES), edge(BURGER, COLA)],
        orderableProductIds: new Set([BURGER, COLA]),
      }),
    );

    expect(picks.map((p) => p.productId)).toEqual([COLA]);
  });

  /**
   * Caught in the browser rather than here, because every test above happened
   * to put the source dish in the basket. On a product sheet it is not: a guest
   * opening a promoted burger with an empty basket was offered that same burger
   * back, through the `featured` tier, which has no source to compare against.
   */
  it("never suggests the dish that prompted it", () => {
    const picks = selectUpsells(
      inputs({
        sourceProductIds: [BURGER],
        basketProductIds: [],
        featured: [
          { productId: BURGER, featuredOrder: 0 },
          { productId: CAKE, featuredOrder: 1 },
        ],
      }),
    );

    expect(picks.map((p) => p.productId)).toEqual([CAKE]);
  });

  it("never suggests any dish in front of the guest, even with an empty basket", () => {
    expect(
      selectUpsells(
        inputs({
          sourceProductIds: [BURGER, PIZZA],
          basketProductIds: [],
          pairings: [edge(BURGER, PIZZA)],
        }),
      ),
    ).toEqual([]);
  });

  it("offers a dish once even when several tiers propose it", () => {
    const picks = selectUpsells(
      inputs({
        pairings: [edge(BURGER, FRIES)],
        coOccurrence: [pair(BURGER, FRIES)],
        featured: [{ productId: FRIES, featuredOrder: 0 }],
      }),
    );

    expect(picks).toHaveLength(1);
    expect(picks[0]!.reason).toBe("pairing");
  });

  it("caps the panel", () => {
    const picks = selectUpsells(
      inputs({
        pairings: [
          edge(BURGER, FRIES),
          edge(BURGER, COLA),
          edge(BURGER, SALAD),
          edge(BURGER, CAKE),
        ],
      }),
    );

    expect(picks).toHaveLength(MAX_PUBLIC_RECOMMENDATIONS);
  });

  it("honours an explicit limit", () => {
    expect(
      selectUpsells(
        inputs({ pairings: [edge(BURGER, FRIES), edge(BURGER, COLA)], limit: 1 }),
      ),
    ).toHaveLength(1);
  });

  it("treats a non-positive limit as nothing to show", () => {
    expect(selectUpsells(inputs({ pairings: [edge(BURGER, FRIES)], limit: 0 }))).toEqual(
      [],
    );
  });

  /**
   * The product sheet gives meal deals a block of their own, so the ranked
   * panel below must not offer the same combo again a few hundred pixels later.
   */
  it("never repeats something already shown elsewhere on the screen", () => {
    const picks = selectUpsells(
      inputs({
        bundles: [bundle(COMBO, [BURGER])],
        pairings: [edge(BURGER, FRIES)],
        excludeProductIds: [COMBO],
      }),
    );

    expect(picks.map((p) => p.productId)).toEqual([FRIES]);
  });

  /** The freed slot goes to the next real suggestion, not to nothing. */
  it("backfills the slot an excluded dish would have taken", () => {
    const picks = selectUpsells(
      inputs({
        limit: 1,
        bundles: [bundle(COMBO, [BURGER])],
        coOccurrence: [pair(BURGER, SALAD)],
        excludeProductIds: [COMBO],
      }),
    );

    expect(picks.map((p) => p.productId)).toEqual([SALAD]);
  });

  /**
   * The product-sheet case: the guest is looking at a dish with an empty
   * basket, and pairings must still appear.
   */
  it("suggests for a dish being viewed with nothing in the basket", () => {
    const picks = selectUpsells(
      inputs({
        sourceProductIds: [BURGER],
        basketProductIds: [],
        pairings: [edge(BURGER, FRIES)],
      }),
    );

    expect(picks).toEqual([
      { productId: FRIES, sourceProductId: BURGER, reason: "pairing" },
    ]);
  });
});

describe("the ladder", () => {
  const everything = inputs({
    sourceProductIds: [BURGER],
    basketProductIds: [BURGER],
    pairings: [edge(BURGER, FRIES)],
    bundles: [bundle(COMBO, [BURGER])],
    coOccurrence: [pair(BURGER, SALAD)],
    featured: [{ productId: CAKE, featuredOrder: 0 }],
  });

  it("orders the tiers: pairing, bundle, history, featured", () => {
    const picks = selectUpsells({ ...everything, limit: 4 });

    expect(picks).toEqual([
      { productId: FRIES, sourceProductId: BURGER, reason: "pairing" },
      { productId: COMBO, sourceProductId: BURGER, reason: "bundle" },
      { productId: SALAD, sourceProductId: BURGER, reason: "frequentlyTogether" },
      { productId: CAKE, sourceProductId: null, reason: "featured" },
    ]);
  });

  /** A venue that states its own pairings never has them displaced. */
  it("lets the owner's pairings fill the panel before anything inferred", () => {
    const picks = selectUpsells({
      ...everything,
      pairings: [edge(BURGER, FRIES), edge(BURGER, COLA), edge(BURGER, SALAD)],
    });

    expect(picks.map((p) => p.reason)).toEqual(["pairing", "pairing", "pairing"]);
  });

  it("falls through to featured only when nothing more specific applies", () => {
    const picks = selectUpsells(
      inputs({ featured: [{ productId: CAKE, featuredOrder: 0 }] }),
    );

    expect(picks).toEqual([
      { productId: CAKE, sourceProductId: null, reason: "featured" },
    ]);
  });

  /** "Something else from the menu" is not a recommendation. */
  it("has no generic fallback below featured", () => {
    expect(selectUpsells(inputs({ sourceProductIds: [PIZZA] }))).toEqual([]);
  });
});

describe("tier 1 — the owner's pairings", () => {
  it("keeps the owner's order", () => {
    const picks = selectUpsells(
      inputs({
        pairings: [edge(BURGER, COLA), edge(BURGER, FRIES), edge(BURGER, SALAD)],
      }),
    );

    expect(picks.map((p) => p.productId)).toEqual([COLA, FRIES, SALAD]);
  });

  it("ignores pairings attached to a dish that is not a source", () => {
    expect(selectUpsells(inputs({ pairings: [edge(PIZZA, COLA)] }))).toEqual([]);
  });

  it("gives the first dish in the basket first call on the slots", () => {
    const picks = selectUpsells(
      inputs({
        sourceProductIds: [BURGER, PIZZA],
        basketProductIds: [BURGER, PIZZA],
        pairings: [
          edge(BURGER, FRIES),
          edge(BURGER, COLA),
          edge(BURGER, SALAD),
          edge(PIZZA, CAKE),
        ],
      }),
    );

    expect(picks.map((p) => p.productId)).toEqual([FRIES, COLA, SALAD]);
  });

  it("credits a shared suggestion to the first source in basket order", () => {
    const picks = selectUpsells(
      inputs({
        sourceProductIds: [BURGER, PIZZA],
        basketProductIds: [BURGER, PIZZA],
        pairings: [edge(BURGER, COLA), edge(PIZZA, COLA)],
      }),
    );

    expect(picks).toEqual([
      { productId: COLA, sourceProductId: BURGER, reason: "pairing" },
    ]);
  });
});

describe("tier 2 — bundles", () => {
  it("offers a deal built around something in the basket", () => {
    const picks = selectUpsells(inputs({ bundles: [bundle(COMBO, [BURGER, FRIES])] }));

    expect(picks).toEqual([
      { productId: COMBO, sourceProductId: BURGER, reason: "bundle" },
    ]);
  });

  it("ignores a deal containing nothing the guest is looking at", () => {
    expect(selectUpsells(inputs({ bundles: [bundle(COMBO, [PIZZA])] }))).toEqual([]);
  });

  it("puts the biggest saving first", () => {
    const picks = selectUpsells(
      inputs({
        limit: 2,
        bundles: [
          bundle("p-small-deal", [BURGER], 10_000),
          bundle("p-big-deal", [BURGER], 90_000),
        ],
        orderableProductIds: new Set([BURGER, "p-small-deal", "p-big-deal"]),
      }),
    );

    expect(picks.map((p) => p.productId)).toEqual(["p-big-deal", "p-small-deal"]);
  });

  /** A venue may sell convenience rather than a discount. */
  it("still offers a deal with no saving, below those that save", () => {
    const picks = selectUpsells(
      inputs({
        limit: 2,
        bundles: [
          bundle("p-no-saving", [BURGER], null),
          bundle("p-saves", [BURGER], 10_000),
        ],
        orderableProductIds: new Set([BURGER, "p-no-saving", "p-saves"]),
      }),
    );

    expect(picks.map((p) => p.productId)).toEqual(["p-saves", "p-no-saving"]);
  });

  it("never offers a bundle that is already in the basket", () => {
    expect(
      selectUpsells(
        inputs({ basketProductIds: [BURGER, COMBO], bundles: [bundle(COMBO, [BURGER])] }),
      ),
    ).toEqual([]);
  });

  it("never offers a bundle that cannot be assembled", () => {
    expect(
      selectUpsells(
        inputs({
          bundles: [bundle(COMBO, [BURGER])],
          orderableProductIds: new Set([BURGER]),
        }),
      ),
    ).toEqual([]);
  });
});

describe("tier 3 — the venue's own history", () => {
  it("suggests a pair that cleared the bars", () => {
    const picks = selectUpsells(inputs({ coOccurrence: [pair(BURGER, SALAD)] }));

    expect(picks).toEqual([
      { productId: SALAD, sourceProductId: BURGER, reason: "frequentlyTogether" },
    ]);
  });

  /** The thresholds are applied here, not by the caller. */
  it("drops a pair with too little evidence", () => {
    expect(
      selectUpsells(inputs({ coOccurrence: [pair(BURGER, SALAD, { pairCount: 2 })] })),
    ).toEqual([]);
  });

  it("drops a merely popular dish that is not actually associated", () => {
    expect(
      selectUpsells(
        inputs({
          coOccurrence: [
            pair(BURGER, COLA, { pairCount: 60, targetSupport: 600, totalOrders: 1000 }),
          ],
        }),
      ),
    ).toEqual([]);
  });

  /** The low-data fallback: a new venue gets owner-defined pairings only. */
  it("consults no history at all while the venue is too new", () => {
    const picks = selectUpsells(
      inputs({
        pairings: [edge(BURGER, FRIES)],
        coOccurrence: [pair(BURGER, SALAD, { totalOrders: 10, targetSupport: 3 })],
      }),
    );

    expect(picks.map((p) => p.reason)).toEqual(["pairing"]);
  });

  it("is not starved by another dish's stronger pair", () => {
    const picks = selectUpsells(
      inputs({
        limit: 1,
        sourceProductIds: [BURGER],
        coOccurrence: [
          pair(PIZZA, CAKE, { pairCount: 90, targetSupport: 20 }),
          pair(BURGER, SALAD),
        ],
      }),
    );

    expect(picks.map((p) => p.productId)).toEqual([SALAD]);
  });
});

describe("tier 4 — featured", () => {
  it("respects the owner's arrangement", () => {
    const picks = selectUpsells(
      inputs({
        limit: 2,
        featured: [
          { productId: CAKE, featuredOrder: 2 },
          { productId: SALAD, featuredOrder: 1 },
        ],
      }),
    );

    expect(picks.map((p) => p.productId)).toEqual([SALAD, CAKE]);
  });

  /** The surface is the origin, exactly as `OrderItem.fromFeatured` records it. */
  it("carries no source dish", () => {
    const picks = selectUpsells(
      inputs({ featured: [{ productId: CAKE, featuredOrder: 0 }] }),
    );

    expect(picks[0]!.sourceProductId).toBe(null);
  });
});

describe("determinism", () => {
  const everything = inputs({
    sourceProductIds: [BURGER, PIZZA],
    basketProductIds: [BURGER, PIZZA],
    pairings: [edge(BURGER, FRIES), edge(PIZZA, COLA)],
    bundles: [bundle(COMBO, [BURGER])],
    coOccurrence: [pair(BURGER, SALAD)],
    featured: [{ productId: CAKE, featuredOrder: 0 }],
    limit: 5,
  });

  it("produces the same panel every time", () => {
    expect(selectUpsells(everything)).toEqual(selectUpsells(everything));
  });

  it("breaks ties without depending on input order", () => {
    const a = selectUpsells({
      ...everything,
      featured: [
        { productId: CAKE, featuredOrder: 0 },
        { productId: "p-other", featuredOrder: 0 },
      ],
      orderableProductIds: new Set([...allOrderable, "p-other"]),
    });
    const b = selectUpsells({
      ...everything,
      featured: [
        { productId: "p-other", featuredOrder: 0 },
        { productId: CAKE, featuredOrder: 0 },
      ],
      orderableProductIds: new Set([...allOrderable, "p-other"]),
    });

    expect(a).toEqual(b);
  });

  it("does not mutate its inputs", () => {
    const featured = [
      { productId: CAKE, featuredOrder: 2 },
      { productId: SALAD, featuredOrder: 1 },
    ];
    selectUpsells(inputs({ featured }));

    expect(featured.map((f) => f.productId)).toEqual([CAKE, SALAD]);
  });
});

describe("bundlesFor", () => {
  it("returns deals containing the dish in front of the guest", () => {
    expect(
      bundlesFor([BURGER], [], [bundle(COMBO, [BURGER, FRIES])], allOrderable).map(
        (b) => b.productId,
      ),
    ).toEqual([COMBO]);
  });

  it("excludes a deal already in the basket", () => {
    expect(
      bundlesFor([BURGER], [COMBO], [bundle(COMBO, [BURGER])], allOrderable),
    ).toEqual([]);
  });

  it("excludes a deal that cannot be assembled", () => {
    expect(
      bundlesFor([BURGER], [], [bundle(COMBO, [BURGER])], new Set([BURGER])),
    ).toEqual([]);
  });

  it("excludes a deal containing nothing relevant", () => {
    expect(bundlesFor([BURGER], [], [bundle(COMBO, [PIZZA])], allOrderable)).toEqual([]);
  });

  it("puts the biggest saving first", () => {
    const deals = [bundle("p-a", [BURGER], 10_000), bundle("p-b", [BURGER], 80_000)];
    const orderable = new Set([BURGER, "p-a", "p-b"]);

    expect(bundlesFor([BURGER], [], deals, orderable).map((b) => b.productId)).toEqual([
      "p-b",
      "p-a",
    ]);
  });

  it("does not mutate its input", () => {
    const deals = [bundle("p-a", [BURGER], 10_000), bundle("p-b", [BURGER], 80_000)];
    bundlesFor([BURGER], [], deals, new Set([BURGER, "p-a", "p-b"]));

    expect(deals.map((b) => b.productId)).toEqual(["p-a", "p-b"]);
  });
});
