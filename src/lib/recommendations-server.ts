import "server-only";
import { prisma } from "./prisma";
import { HttpError } from "./auth/guards";
import type { Prisma } from "@/generated/prisma/client";
import type { RecommendationInput } from "./validation";
import {
  derivePerformance,
  rankByRevenue,
  type RecommendationPerformance,
  type RecommendationStats,
} from "./recommendations";

/**
 * The database half of upselling. The rules themselves are in
 * `recommendations.ts`, which stays pure; this is persistence and ownership.
 *
 * Named after the `appearance.ts` / `appearance-server.ts` pair already in the
 * codebase: the shared logic is importable from anywhere, and everything that
 * touches Prisma stays behind a `server-only` marker.
 */

/** What the editor round-trips, and what the product routes return. */
export const recommendationSelect = {
  recommendedProductId: true,
  isActive: true,
  sortOrder: true,
} as const;

export const recommendationOrderBy = [
  { sortOrder: "asc" },
  { createdAt: "asc" },
] satisfies Prisma.ProductRecommendationOrderByWithRelationInput[];

/**
 * Replaces a dish's suggestions, refusing anything that is not the owner's to
 * point at.
 *
 * Three refusals, and each is a 4xx with a message rather than a silent drop,
 * because every one of them means the editor and the server disagree about
 * what exists:
 *
 *   * **self-reference** — a dish suggesting itself. Also refused by a CHECK
 *     constraint, so it cannot arrive by any other route either.
 *   * **cross-tenant** — the target is not this restaurant's product. Resolved
 *     by counting how many of the requested ids exist *within the tenant*
 *     rather than by trusting the ids: a product from another venue is simply
 *     not in the result, so the count comes up short and the write is refused
 *     before anything is written.
 *   * **unknown** — a deleted product, which reads identically to a foreign one
 *     and is reported the same way. Telling the two apart would confirm that
 *     some other venue owns that id.
 *
 * Replaced wholesale inside the caller's transaction, like `infoSections`,
 * `optionGroups` and the availability windows before it: the editor submits the
 * full list, so diffing would buy nothing but a half-applied state to debug.
 */
export async function replaceRecommendations(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  sourceProductId: string,
  inputs: readonly RecommendationInput[],
): Promise<void> {
  await tx.productRecommendation.deleteMany({ where: { sourceProductId } });

  if (inputs.length === 0) return;

  if (inputs.some((input) => input.recommendedProductId === sourceProductId)) {
    throw new HttpError(
      400,
      "یک محصول نمی‌تواند خودش را پیشنهاد دهد",
      "RECOMMENDATION_SELF_REFERENCE",
    );
  }

  const targetIds = [...new Set(inputs.map((input) => input.recommendedProductId))];

  // Scoped to the tenant, so ownership is proven by the query rather than
  // checked after the fact against ids the caller supplied.
  const owned = await tx.product.findMany({
    where: { id: { in: targetIds }, restaurantId },
    select: { id: true },
  });

  if (owned.length !== targetIds.length) {
    throw new HttpError(
      400,
      "محصول پیشنهادی پیدا نشد",
      "RECOMMENDATION_PRODUCT_NOT_FOUND",
    );
  }

  await tx.productRecommendation.createMany({
    data: inputs.map((input, index) => ({
      // From the session, never the request body.
      restaurantId,
      sourceProductId,
      recommendedProductId: input.recommendedProductId,
      isActive: input.isActive,
      // Position is the order, matching how info sections and option groups
      // already work.
      sortOrder: index,
    })),
  });
}

/**
 * Which claimed attributions are real.
 *
 * A guest's browser says "I added the chips because you suggested them with the
 * burger". That claim decides what the owner later believes their suggestions
 * earned, so it is checked rather than recorded: the pair must be an edge that
 * actually exists, is switched on, and belongs to the venue whose menu was
 * ordered from.
 *
 * Returns the subset that survives. Unverifiable claims are dropped silently
 * rather than refused — the order itself is perfectly valid, and failing a
 * guest's dinner over an analytics detail would be the wrong trade. The effect
 * of a fabricated claim is therefore nothing at all.
 *
 * One query for the whole basket, not one per line.
 */
export async function verifyAttributions(
  menuOwnerId: string,
  claims: readonly { productId: string; recommendedFrom: string }[],
): Promise<Set<string>> {
  if (claims.length === 0) return new Set();

  const edges = await prisma.productRecommendation.findMany({
    where: {
      restaurantId: menuOwnerId,
      isActive: true,
      OR: claims.map((claim) => ({
        sourceProductId: claim.recommendedFrom,
        recommendedProductId: claim.productId,
      })),
    },
    select: { sourceProductId: true, recommendedProductId: true },
  });

  return new Set(
    edges.map((edge) => attributionKey(edge.recommendedProductId, edge.sourceProductId)),
  );
}

/** Stable key for the verified-attribution set. */
export function attributionKey(productId: string, recommendedFrom: string): string {
  return `${productId}|${recommendedFrom}`;
}

// ------------------------------ reporting ----------------------------------

export interface RecommendationReportRow extends RecommendationPerformance {
  sourceName: string;
  recommendedName: string;
}

/**
 * How every suggestion performed over a window, for one venue.
 *
 * Four aggregate reads and one name lookup, regardless of how many suggestions
 * a venue has configured — the alternative, a query per pair, is exactly the
 * N+1 this must not be. All four are covered by the indexes the migration
 * added, and none of it runs anywhere near the public menu.
 *
 * `groupBy` on the event table gives the three browser-reported counts; the
 * order lines give the two that are facts. They are joined in JS on the pair,
 * which is the same shape `analytics.ts` already uses for its own reports.
 */
export async function getRecommendationPerformance(
  restaurantId: string,
  range: { from: Date; to: Date },
): Promise<RecommendationReportRow[]> {
  const window = { gte: range.from, lte: range.to };

  const [events, attributedLines] = await Promise.all([
    prisma.recommendationEvent.groupBy({
      by: ["sourceProductId", "recommendedProductId", "type"],
      where: { restaurantId, createdAt: window },
      _count: { _all: true },
    }),
    /*
      Attributed sales — the count and the revenue from one read.

      Read as rows rather than aggregated because revenue is
      `priceSnapshot × quantity`, a product of two columns that no `groupBy`
      can sum in a single pass. Since the rows have to be fetched anyway, the
      purchase count comes from the same pass instead of a second query.

      `status: { not: "CANCELED" }` is the platform's existing definition of a
      counted sale — the same rule every figure in `analytics.ts` applies — so
      a suggestion can never be reported as having earned money on an order the
      venue cancelled. Scoped by the *order's* restaurant, because that is where
      the sale happened.
    */
    prisma.orderItem.findMany({
      where: {
        recommendedFromProductId: { not: null },
        order: { restaurantId, status: { not: "CANCELED" }, placedAt: window },
      },
      select: {
        productId: true,
        recommendedFromProductId: true,
        priceSnapshot: true,
        quantity: true,
      },
    }),
  ]);

  const rows = new Map<
    string,
    RecommendationStats & { source: string; target: string }
  >();

  const rowFor = (source: string, target: string) => {
    const key = `${source}|${target}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        source,
        target,
        impressions: 0,
        interactions: 0,
        addedToCart: 0,
        purchases: 0,
        revenue: 0,
      };
      rows.set(key, row);
    }
    return row;
  };

  for (const event of events) {
    const row = rowFor(event.sourceProductId, event.recommendedProductId);
    const count = event._count._all;
    if (event.type === "IMPRESSION") row.impressions += count;
    else if (event.type === "INTERACTION") row.interactions += count;
    else row.addedToCart += count;
  }

  for (const line of attributedLines) {
    // `productId` is null once the dish itself has been deleted, at which point
    // the line can no longer be credited to a pair. Its money stays in the
    // venue's ordinary revenue; only the attribution is lost.
    if (!line.productId || !line.recommendedFromProductId) continue;

    const row = rowFor(line.recommendedFromProductId, line.productId);
    row.purchases += 1;
    row.revenue += line.priceSnapshot * line.quantity;
  }

  if (rows.size === 0) return [];

  // One lookup for every name the table will print, rather than one per row.
  const productIds = [
    ...new Set([...rows.values()].flatMap((row) => [row.source, row.target])),
  ];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, restaurantId },
    select: { id: true, name: true },
  });
  const nameById = new Map(products.map((p) => [p.id, p.name]));

  return rankByRevenue(
    [...rows.values()].map((row) =>
      derivePerformance({
        sourceProductId: row.source,
        recommendedProductId: row.target,
        impressions: row.impressions,
        interactions: row.interactions,
        addedToCart: row.addedToCart,
        purchases: row.purchases,
        revenue: row.revenue,
      }),
    ),
  ).map((row) => ({
    ...row,
    sourceName: nameById.get(row.sourceProductId) ?? "—",
    recommendedName: nameById.get(row.recommendedProductId) ?? "—",
  }));
}
