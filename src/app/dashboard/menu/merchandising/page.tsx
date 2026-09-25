import type { Metadata } from "next";
import { requirePageTab } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { menuOwnerId } from "@/lib/menu";
import { resolveUpgrade } from "@/lib/upgrades";
import { rankCoOccurrence } from "@/lib/co-occurrence";
import {
  getPairStats,
  pairStatsComputedAt,
  refreshPairStatsIfStale,
} from "@/lib/co-occurrence-server";
import { MerchandisingView, type MerchandisingProduct } from "./view";

export const metadata: Metadata = { title: "فروش و پیشنهادها" };
export const dynamic = "force-dynamic";

/**
 * "What am I promoting, and where will it appear?"
 *
 * The one screen that answers both. Every merchandising decision in this
 * product is made where it belongs — a pairing in the dish's own dialog, a
 * badge in the featured editor, a size ladder in its option group — which is
 * right for *making* the decision and useless for *reviewing* them. An owner
 * with forty dishes cannot open forty dialogs to find out what they have
 * switched on.
 *
 * Guarded by the `menu` tab rather than being owner-only. Someone trusted to
 * edit the menu already sets every one of these from the product dialog; a
 * second, stricter gate on the read-only summary of their own work would be
 * theatre.
 *
 * **Scoped to the menu owner**, not to `restaurantId`. Menu content and its
 * suggestions belong to the venue that owns the menu, so a branch manager sees
 * the chain's merchandising because it is the menu they serve — the same rule
 * `menuOwnerId` applies everywhere else.
 */
export default async function MerchandisingPage() {
  const { restaurantId } = await requirePageTab("menu", "/dashboard/menu/merchandising");

  const restaurant = await prisma.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
    select: { id: true, parentRestaurantId: true },
  });

  const ownerId = menuOwnerId(restaurant);

  /*
    The counting pass, but only when the stored answer has gone stale.

    This is the one place in the product that recomputes co-occurrence, and it
    is deliberately here: an authenticated dashboard page, visited rarely, where
    a second of work is invisible. The public menu only ever reads the result.
    A failure is swallowed inside the helper — stale figures beat a page that
    will not load — and the timestamp below always states what the owner is
    actually looking at.
  */
  await refreshPairStatsIfStale(ownerId);

  const [products, pairStats, computedAt] = await Promise.all([
    prisma.product.findMany({
      where: { restaurantId: ownerId },
      orderBy: [{ categoryId: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        price: true,
        isFeatured: true,
        featuredLabel: true,
        category: { select: { name: true } },
        recommendations: {
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { recommendedProductId: true },
        },
        bundleItems: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { componentProductId: true, quantity: true },
        },
        optionGroups: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            isRequired: true,
            isUpgrade: true,
            maxSelect: true,
            choices: {
              orderBy: { sortOrder: "asc" },
              select: { id: true, name: true, priceDelta: true, isAvailable: true },
            },
          },
        },
      },
    }),
    getPairStats(ownerId),
    pairStatsComputedAt(ownerId),
  ]);

  const nameById = new Map(products.map((p) => [p.id, p.name]));

  const rows: MerchandisingProduct[] = products.map((product) => {
    /*
      The upgrade ladder, resolved by the same function the guest menu uses.

      An owner reading "Large +40,000" here and a guest reading it on the menu
      are looking at one calculation, not two that agree today.
    */
    const upgrade = resolveUpgrade(product.optionGroups);

    return {
      id: product.id,
      name: product.name,
      categoryName: product.category.name,
      isFeatured: product.isFeatured,
      featuredLabel: product.featuredLabel,
      pairingNames: product.recommendations.flatMap(
        (edge) => nameById.get(edge.recommendedProductId) ?? [],
      ),
      bundleComponentNames: product.bundleItems.flatMap((item) => {
        const name = nameById.get(item.componentProductId);
        if (!name) return [];
        return [item.quantity > 1 ? `${item.quantity}× ${name}` : name];
      }),
      upgradeOptions:
        upgrade?.options.map((option) => ({
          name: option.name,
          extraCost: option.extraCost,
        })) ?? [],
    };
  });

  /*
    The history-derived suggestions, ranked by association rather than by
    frequency — see `co-occurrence.ts` for why raw counts would hand every slot
    to the single best-selling dish.

    Pairs the owner has *already* configured are dropped: telling someone to do
    what they have done is noise, and it would bury the pairs they have not.
  */
  const configured = new Set(
    products.flatMap((product) =>
      product.recommendations.map((edge) => `${product.id}|${edge.recommendedProductId}`),
    ),
  );

  const suggestions = rankCoOccurrence(pairStats)
    .filter((pair) => !configured.has(`${pair.sourceProductId}|${pair.targetProductId}`))
    .filter(
      (pair) => nameById.has(pair.sourceProductId) && nameById.has(pair.targetProductId),
    )
    // Twelve is enough to act on in one sitting. An owner who clears them sees
    // the next twelve on their following visit.
    .slice(0, 12)
    .map((pair) => ({
      sourceProductId: pair.sourceProductId,
      targetProductId: pair.targetProductId,
      sourceName: nameById.get(pair.sourceProductId) ?? "—",
      targetName: nameById.get(pair.targetProductId) ?? "—",
      pairCount: pair.pairCount,
      confidence: pair.confidence,
    }));

  /*
    Each dish's current suggestions, shipped with the page.

    Accepting a co-occurrence suggestion has to *append* to this list, because
    the product route replaces child collections wholesale — sending only the
    new edge would delete the owner's others. The obvious way to get it is to
    read the product back before patching, and that is exactly what the first
    attempt did: `GET /api/products/:id` does not exist, and returned 405.

    Adding a GET handler would have been a new authenticated read surface for
    data this page has already loaded. Passing it down costs nothing and adds
    no endpoint.
  */
  const existingBySource: Record<string, string[]> = {};
  for (const product of products) {
    existingBySource[product.id] = product.recommendations.map(
      (edge) => edge.recommendedProductId,
    );
  }

  return (
    <MerchandisingView
      products={rows}
      suggestions={suggestions}
      existingBySource={existingBySource}
      computedAt={computedAt?.toISOString() ?? null}
    />
  );
}
