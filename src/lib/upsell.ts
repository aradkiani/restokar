/**
 * One decision about what to suggest, shared by every surface that suggests.
 *
 * Before this module there were two selection rules: the cart strip walked the
 * owner's edges through `selectRecommendations`, and the product sheet filtered
 * the same edges inline — uncapped, and without excluding what the guest had
 * already put in the basket. Two surfaces, two behaviours, and a fix to one
 * that did not reach the other. This is the single rule both now call.
 *
 * Free of database and framework imports like every other domain module here.
 * The server halves gather the four kinds of candidate; this decides which of
 * them a guest actually sees, in what order, and — the part that matters
 * commercially — **why**.
 *
 * ### Every suggestion carries a reason
 *
 * Not decoration. A guest reading «اغلب با هم سفارش داده می‌شوند» is being told
 * something true and checkable, and an owner looking at the same suggestion in
 * the dashboard can see which of their decisions produced it. A suggestion
 * nobody can explain is the "random recommended products" this feature is
 * explicitly not.
 *
 * ### The ladder
 *
 * Tiers are tried in order and stop when the limit is full, so a venue that has
 * stated its own pairings never has them displaced by anything inferred:
 *
 *   1. **`pairing`** — the owner attached this dish to that one. A human who
 *      cooks the food said so, which outranks every other kind of evidence.
 *   2. **`bundle`** — a meal deal containing something already in the basket.
 *      Ranked by what it saves, because that is the offer.
 *   3. **`frequentlyTogether`** — the venue's own order history, having cleared
 *      the support, confidence and lift bars in `co-occurrence.ts`.
 *   4. **`featured`** — what the owner is promoting anyway. The floor of the
 *      ladder rather than a tier of its own: it fires only when nothing more
 *      specific filled the slots.
 *
 * There is deliberately **no generic fallback below that**. "Something else
 * from the menu" is not a recommendation, and a panel that always finds three
 * things to say is a panel guests learn to ignore. Empty is a valid answer and
 * the surfaces render nothing when they get it.
 *
 * ### What is deliberately not here
 *
 * No per-guest personalisation, no profile, no session history. The inputs are
 * the basket in front of the engine, the venue's merchandising rules and the
 * venue's aggregate history — nothing that identifies a person.
 */

import { partnersFor, type ProductPairCounts } from "./co-occurrence";
import { MAX_PUBLIC_RECOMMENDATIONS, type RecommendationEdge } from "./recommendations";

export { MAX_PUBLIC_RECOMMENDATIONS };

/**
 * Why a dish is being suggested.
 *
 * A closed union rather than free text, so each one has a dictionary key and a
 * surface cannot invent a fifth reason without the compiler noticing.
 */
export type UpsellReason = "pairing" | "bundle" | "frequentlyTogether" | "featured";

/** One suggestion, and the evidence behind it. */
export interface UpsellCandidate {
  productId: string;
  /**
   * The dish that prompted it — what makes the suggestion contextual rather
   * than an advertisement.
   *
   * Null only for `featured`, which has no source dish: the surface itself is
   * the origin, exactly as `OrderItem.fromFeatured` already records it.
   */
  sourceProductId: string | null;
  reason: UpsellReason;
}

/** A meal deal, as the ranking needs to see it. */
export interface BundleOffer {
  /** The bundle product itself — an ordinary product, per `bundles.ts`. */
  productId: string;
  /** What it contains, already normalised. */
  componentProductIds: readonly string[];
  /** Whole Toman saved against buying the parts, or null when there is none. */
  saving: number | null;
}

/** A promoted dish, already confirmed to be inside its window by `featured.ts`. */
export interface FeaturedCandidate {
  productId: string;
  /** The owner's arrangement, lowest first. */
  featuredOrder: number;
}

export interface UpsellInputs {
  /**
   * The dishes prompting the suggestions.
   *
   * The whole basket in the cart, the single dish being viewed on a product
   * sheet. One engine serves both because the question is the same one asked at
   * two moments, and order matters: the first source gets first call on the
   * limited slots.
   */
  sourceProductIds: readonly string[];
  /**
   * Everything already in the basket, never suggested again.
   *
   * Separate from `sourceProductIds` because they diverge on a product sheet: a
   * guest looking at the burger has an empty basket, and pairings should still
   * appear. Offering chips to someone who already has chips is the fastest way
   * to make the panel look automated.
   */
  basketProductIds: readonly string[];
  /**
   * What can actually be ordered right now.
   *
   * The effective answer the caller already obtained from `resolveAvailability`
   * — never re-derived here. A dish outside its serving hours or switched off is
   * simply absent from the set, which is what stops this surface advertising
   * something the server would refuse to sell.
   */
  orderableProductIds: ReadonlySet<string>;

  /**
   * Dishes already shown elsewhere on this screen.
   *
   * Not in the basket and perfectly orderable — simply already on view. The
   * product sheet gives meal deals a block of their own, listing what each
   * contains and what it saves, and without this the ranked panel below would
   * offer the same combo a second time a few hundred pixels later. One offer
   * repeated reads as a page that is not paying attention.
   *
   * Kept as an input rather than solved in the surface because the exclusion is
   * part of *what to suggest*, and that decision has exactly one home.
   */
  excludeProductIds?: readonly string[];

  /** Tier 1, in the owner's own order. */
  pairings?: readonly RecommendationEdge[];
  /** Tier 2. */
  bundles?: readonly BundleOffer[];
  /** Tier 3, raw counts — the thresholds are applied here, not by the caller. */
  coOccurrence?: readonly ProductPairCounts[];
  /** Tier 4. */
  featured?: readonly FeaturedCandidate[];

  limit?: number;
}

/**
 * What a guest should be offered, best reason first.
 *
 * Deterministic end to end: every tier has a total ordering, the tiers are
 * tried in a fixed sequence, and nothing consults a clock or a random source.
 * The same basket always produces the same panel — a list that reshuffles
 * between renders reads as broken, and an owner cannot check a suggestion they
 * cannot reproduce.
 */
export function selectUpsells(inputs: UpsellInputs): UpsellCandidate[] {
  const limit = inputs.limit ?? MAX_PUBLIC_RECOMMENDATIONS;
  if (limit <= 0) return [];

  const picked: UpsellCandidate[] = [];
  const taken = new Set([
    ...inputs.basketProductIds,
    ...(inputs.excludeProductIds ?? []),
    /*
      A dish is never suggested alongside itself.

      In the cart this is already covered — the sources *are* the basket — but
      on a product sheet the basket is usually empty, and the `featured` tier
      has no source dish to compare against. Without this a promoted burger
      recommends itself at the bottom of its own page, which is the single most
      obviously broken thing this panel could do.
    */
    ...inputs.sourceProductIds,
  ]);

  /**
   * Accepts a candidate if it survives the three rules every tier shares, and
   * reports whether the panel is now **full**.
   *
   * The return value is "stop looking", not "accepted" — a rejected candidate
   * and an accepted one that left a slot spare both say `false`, because in
   * both cases the caller should carry on. Every tier is a loop over
   * `if (offer(…)) return picked;`, so this is the only place the limit is
   * checked.
   *
   * The three rules live here rather than in each tier so a tier added later
   * cannot forget one — which is precisely how the product sheet came to differ
   * from the cart in the first place.
   */
  const offer = (candidate: UpsellCandidate): boolean => {
    if (taken.has(candidate.productId)) return false;
    if (!inputs.orderableProductIds.has(candidate.productId)) return false;

    taken.add(candidate.productId);
    picked.push(candidate);
    return picked.length >= limit;
  };

  // ---- 1. the owner's own pairings ----------------------------------------
  //
  // Source order outer, owner order inner: the dish the guest chose first gets
  // first call on the slots, and within one dish the owner's arrangement wins.
  const pairings = inputs.pairings ?? [];
  for (const sourceProductId of inputs.sourceProductIds) {
    for (const edge of pairings) {
      if (edge.sourceProductId !== sourceProductId) continue;
      if (
        offer({
          productId: edge.recommendedProductId,
          sourceProductId,
          reason: "pairing",
        })
      )
        return picked;
    }
  }

  // ---- 2. meal deals containing something in front of the guest -----------
  //
  // Ranked by what they save, because that is the entire pitch. A bundle with
  // no saving is still offered — a venue may sell convenience rather than a
  // discount — but it sorts below every bundle that does save something.
  const bundles = [...(inputs.bundles ?? [])].sort(
    (a, b) => (b.saving ?? 0) - (a.saving ?? 0) || a.productId.localeCompare(b.productId),
  );
  for (const bundle of bundles) {
    // The source is the dish in the basket that the deal is built around, so
    // attribution credits the burger that led to the combo.
    const source = inputs.sourceProductIds.find((id) =>
      bundle.componentProductIds.includes(id),
    );
    if (!source) continue;
    if (offer({ productId: bundle.productId, sourceProductId: source, reason: "bundle" }))
      return picked;
  }

  // ---- 3. what this venue's own bills say ---------------------------------
  //
  // `partnersFor` applies the support, confidence and lift bars, so a thin or
  // merely-popular pair never reaches this loop. Per source rather than across
  // the whole graph: ranked globally, one dish's strong pair would consume the
  // slots and leave the dish actually in front of the guest with nothing.
  const coOccurrence = inputs.coOccurrence ?? [];
  if (coOccurrence.length > 0) {
    for (const sourceProductId of inputs.sourceProductIds) {
      for (const partner of partnersFor(sourceProductId, coOccurrence, limit)) {
        if (
          offer({
            productId: partner.targetProductId,
            sourceProductId,
            reason: "frequentlyTogether",
          })
        )
          return picked;
      }
    }
  }

  // ---- 4. what the owner is promoting anyway ------------------------------
  //
  // The floor of the ladder. Reached only when nothing more specific filled the
  // slots, which is why a venue with good pairings never sees its featured
  // dishes repeated into the cart.
  const featured = [...(inputs.featured ?? [])].sort(
    (a, b) => a.featuredOrder - b.featuredOrder || a.productId.localeCompare(b.productId),
  );
  for (const candidate of featured) {
    if (
      offer({ productId: candidate.productId, sourceProductId: null, reason: "featured" })
    )
      return picked;
  }

  return picked;
}

/**
 * The bundles worth offering for a given basket.
 *
 * Split out because the product sheet wants this list on its own — "this dish
 * is part of a meal deal" is worth saying next to the dish, whether or not the
 * deal wins a slot in the ranked panel above.
 *
 * A bundle already in the basket is excluded, and so is one that cannot be
 * assembled; `bundles.ts` decides the latter and the caller passes the survivors
 * through `orderableProductIds`.
 */
export function bundlesFor(
  sourceProductIds: readonly string[],
  basketProductIds: readonly string[],
  bundles: readonly BundleOffer[],
  orderableProductIds: ReadonlySet<string>,
): BundleOffer[] {
  const inBasket = new Set(basketProductIds);
  const sources = new Set(sourceProductIds);

  return bundles
    .filter(
      (bundle) =>
        !inBasket.has(bundle.productId) &&
        orderableProductIds.has(bundle.productId) &&
        bundle.componentProductIds.some((id) => sources.has(id)),
    )
    .sort(
      (a, b) =>
        (b.saving ?? 0) - (a.saving ?? 0) || a.productId.localeCompare(b.productId),
    );
}
