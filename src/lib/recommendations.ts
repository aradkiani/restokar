/**
 * "People who order this usually want that too" — as the owner defines it.
 *
 * The whole feature is one idea: a venue states which dishes go together, the
 * menu offers them at the moment a guest is deciding, and the owner later sees
 * whether it earned anything. Nothing is inferred, nothing is generated; a
 * suggestion appears because someone who cooks the food said it should.
 *
 * Free of database and framework imports, like `pricing.ts`, `inventory.ts` and
 * `availability.ts`. What is worth testing here is the selection rule and the
 * arithmetic behind the metrics, and both are decisions about money — the
 * former about what a guest is offered, the latter about what an owner believes
 * is working.
 */

import {
  deriveRates,
  rankByRevenue,
  type MerchandisingRates,
  type MerchandisingStats,
} from "./merchandising";

/**
 * How many suggestions a guest is shown for one dish.
 *
 * Three, because the panel sits inside a cart sheet on a phone and a fourth row
 * pushes the checkout button off the screen — and because a list long enough to
 * scan is a list nobody scans. An owner may configure more; the cap decides how
 * many of them are shown, never how many may exist.
 */
export const MAX_PUBLIC_RECOMMENDATIONS = 3;

/** An edge as the public menu carries it, already ordered by the server. */
export interface RecommendationEdge {
  sourceProductId: string;
  recommendedProductId: string;
}

/**
 * Which suggestions to show, given what is already in the basket.
 *
 * Four rules, in order, and each exists because the alternative is worse:
 *
 *   1. **Only for dishes actually in the basket.** The offer is contextual —
 *      "chips with that burger" — and a suggestion attached to nothing is an
 *      advertisement.
 *   2. **Never something already in the basket.** Offering chips to a guest who
 *      has chips is the fastest way to make the whole panel look automated.
 *   3. **Never a dish that cannot be ordered right now.** Availability is not
 *      re-derived here; the caller passes the products the menu already
 *      resolved through `availability.ts`, so an out-of-hours or sold-out dish
 *      is simply absent from `orderable`.
 *   4. **Deterministic, and capped.** Server order first — which is the owner's
 *      `sortOrder` — then basket order, so the same basket always produces the
 *      same panel. A list that reshuffles between renders reads as broken.
 *
 * Deduplicated across sources: a burger and a pizza that both suggest the same
 * drink offer it once, credited to the first source in basket order, because
 * two identical rows is a bug the guest can see.
 */
export function selectRecommendations(
  edges: readonly RecommendationEdge[],
  basketProductIds: readonly string[],
  orderableProductIds: ReadonlySet<string>,
  limit: number = MAX_PUBLIC_RECOMMENDATIONS,
): { sourceProductId: string; recommendedProductId: string }[] {
  const inBasket = new Set(basketProductIds);
  const taken = new Set<string>();
  const picked: { sourceProductId: string; recommendedProductId: string }[] = [];

  // Basket order outer, server order inner: the dish the guest chose first gets
  // first call on the limited slots.
  for (const sourceProductId of basketProductIds) {
    for (const edge of edges) {
      if (edge.sourceProductId !== sourceProductId) continue;

      const target = edge.recommendedProductId;
      if (inBasket.has(target)) continue;
      if (taken.has(target)) continue;
      if (!orderableProductIds.has(target)) continue;

      taken.add(target);
      picked.push({ sourceProductId, recommendedProductId: target });
      if (picked.length >= limit) return picked;
    }
  }

  return picked;
}

// ------------------------------- metrics -----------------------------------

/**
 * What one suggestion did, over a reporting window.
 *
 * The counts and both rates are defined once in `merchandising.ts`, which the
 * featured-dish report shares — "conversion" must not be able to mean two
 * different things on two panels of the same dashboard.
 */
export type RecommendationStats = MerchandisingStats;

export interface RecommendationPerformance
  extends MerchandisingStats, MerchandisingRates {
  sourceProductId: string;
  recommendedProductId: string;
}

export function derivePerformance(
  row: MerchandisingStats & {
    sourceProductId: string;
    recommendedProductId: string;
  },
): RecommendationPerformance {
  return { ...row, ...deriveRates(row) };
}

export { rankByRevenue };
