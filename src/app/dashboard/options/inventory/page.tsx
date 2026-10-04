import type { Metadata } from "next";
import { requirePageOwner } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { catalogueItems } from "@/lib/stock";
import { InventoryManager } from "./manager";

export const metadata: Metadata = { title: "موجودی انبار" };
export const dynamic = "force-dynamic";

/**
 * Ingredient stock and dish recipes.
 *
 * The session's tenant *is* the menu owner here: a branch is run by a
 * BRANCH_MANAGER, which cannot reach More Options at all, so an OWNER who gets
 * this far always owns the products these recipes hang off. That is why no
 * `menuOwnerId` resolution is needed, and why the API routes scope the same way.
 *
 * This is the catalogue — items, units, reference prices and recipes — which
 * belongs to the menu owner. The quantity shown is the owner's own site; each
 * site's shelves, purchases, waste and counts live in /dashboard/inventory.
 */
export default async function InventoryPage() {
  const { restaurantId: ownerId } = await requirePageOwner(
    "/dashboard/options/inventory",
  );

  const [items, products] = await Promise.all([
    catalogueItems(prisma, ownerId, { isActive: true }),
    prisma.product.findMany({
      where: { restaurantId: ownerId },
      orderBy: { name: "asc" },
      take: 500,
      select: {
        id: true,
        name: true,
        ingredients: { select: { itemId: true, perUnitMilli: true, unit: true } },
      },
    }),
  ]);

  return <InventoryManager initialItems={items} products={products} />;
}
