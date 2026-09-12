import "server-only";
import { prisma } from "./prisma";
import {
  deriveRates,
  rankByRevenue,
  type MerchandisingRates,
  type MerchandisingStats,
} from "./merchandising";

/**
 * The database half of merchandising. The rules are in `featured.ts`, which
 * stays pure; this is reporting.
 *
 * Named after the `appearance.ts` / `appearance-server.ts` pair the codebase
 * already uses, and the sibling of `recommendations-server.ts`.
 */

export interface FeaturedReportRow extends MerchandisingStats, MerchandisingRates {
  productId: string;
  productName: string;
}

/**
 * How every featured dish performed over a window, for one venue.
 *
 * Two reads and one name lookup, regardless of how many dishes are promoted —
 * never one query per dish. Both are covered by the indexes the migration
 * added, and none of it runs anywhere near the public menu.
 *
 * The event table gives the three browser-reported counts; the order lines give
 * the two that are facts. Joined in JS on the product, the same shape
 * `analytics.ts` and the suggestion report already use.
 */
export async function getFeaturedPerformance(
  restaurantId: string,
  range: { from: Date; to: Date },
): Promise<FeaturedReportRow[]> {
  const window = { gte: range.from, lte: range.to };

  const [events, attributedLines] = await Promise.all([
    prisma.featuredProductEvent.groupBy({
      by: ["productId", "type"],
      where: { restaurantId, createdAt: window },
      _count: { _all: true },
    }),
    /*
      Attributed sales — the count and the revenue from one read.

      Rows rather than an aggregate because revenue is
      `priceSnapshot × quantity`, a product of two columns no `groupBy` can sum
      in one pass; since the rows must be fetched anyway, the purchase count
      comes from the same pass.

      `status: { not: "CANCELED" }` is the platform's existing definition of a
      counted sale — the same rule every figure in `analytics.ts` applies — so a
      promotion can never be reported as having earned money on an order the
      venue cancelled.
    */
    prisma.orderItem.findMany({
      where: {
        fromFeatured: true,
        order: { restaurantId, status: { not: "CANCELED" }, placedAt: window },
      },
      select: { productId: true, priceSnapshot: true, quantity: true },
    }),
  ]);

  const rows = new Map<string, MerchandisingStats & { productId: string }>();

  const rowFor = (productId: string) => {
    let row = rows.get(productId);
    if (!row) {
      row = {
        productId,
        impressions: 0,
        interactions: 0,
        addedToCart: 0,
        purchases: 0,
        revenue: 0,
      };
      rows.set(productId, row);
    }
    return row;
  };

  for (const event of events) {
    const row = rowFor(event.productId);
    const count = event._count._all;
    if (event.type === "IMPRESSION") row.impressions += count;
    // A "view" is opening the dish from a featured surface — the merchandising
    // equivalent of tapping a suggestion.
    else if (event.type === "VIEW") row.interactions += count;
    else row.addedToCart += count;
  }

  for (const line of attributedLines) {
    // Null once the dish itself has been deleted, at which point the line can no
    // longer be credited. Its money stays in ordinary revenue; only the
    // attribution is lost — the same trade `OrderItem.productId` already makes.
    if (!line.productId) continue;

    const row = rowFor(line.productId);
    row.purchases += 1;
    row.revenue += line.priceSnapshot * line.quantity;
  }

  if (rows.size === 0) return [];

  // One lookup for every name the table prints, rather than one per row. Scoped
  // to the tenant, so a stale id from another venue resolves to nothing.
  const products = await prisma.product.findMany({
    where: { id: { in: [...rows.keys()] }, restaurantId },
    select: { id: true, name: true },
  });
  const nameById = new Map(products.map((p) => [p.id, p.name]));

  return rankByRevenue([...rows.values()]).map((row) => ({
    ...row,
    ...deriveRates(row),
    productName: nameById.get(row.productId) ?? "—",
  }));
}
